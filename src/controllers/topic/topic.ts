import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import { safeAsync } from '@mrpelz/misc-utils/async';
import { sleep } from '@mrpelz/misc-utils/sleep';
import { Observable, Observer } from '@mrpelz/observable';
import { NullState, ReadOnlyNullState } from '@mrpelz/observable/state';
import z from 'zod';

import { ServiceUnavailableError } from '../../endpoints/error.js';
import {
  ContentType,
  environment,
  ForwardStrategy,
} from '../../environment.js';
import { makeLogger } from '../../logging.js';
import {
  abortOnLengthExceeeded,
  awaitEnd,
  createReadableFromValue,
  piggybackReadable,
} from '../../utils.js';
import { TPersistence } from '../persistence/main.js';

const logger = makeLogger(import.meta.filename);

export enum GetPayloadType {
  ALL = 'all',
  FUTURE = 'future',
  FUTURE_NON_EMPTY = 'future-non-empty',
  NON_EMPTY = 'non-empty',
  PERSISTED = 'persisted',
}

export type GetPayloadTypeStreamable = Exclude<
  GetPayloadType,
  GetPayloadType.PERSISTED
>;

export type ReadableStreamWithLength = {
  length: number;
  stream: Readable;
};

export type GetPayloadResult<T extends GetPayloadType> = T extends
  | GetPayloadType.FUTURE_NON_EMPTY
  | GetPayloadType.NON_EMPTY
  ? ReadableStreamWithLength
  : ReadableStreamWithLength | undefined;

export const TopicId = z.uuid();

export const TopicPath = z
  .array(
    z
      .string()
      .regex(
        new RegExp('^[^*+]+$'),
        String.raw`must not be wildcard path (i.e. no '*' or '+' path items)`,
      ),
  )
  .default([]);

export const futurizePayloadType = (
  type: GetPayloadTypeStreamable,
): GetPayloadTypeStreamable => {
  switch (type) {
    case GetPayloadType.ALL: {
      return GetPayloadType.FUTURE;
    }

    case GetPayloadType.NON_EMPTY: {
      return GetPayloadType.FUTURE_NON_EMPTY;
    }

    default: {
      return type;
    }
  }
};

export class Topic {
  private _state?: ReadableStreamWithLength;

  private readonly _stateRefresh = new NullState();

  readonly contentType: z.infer<typeof ContentType>;
  readonly path: z.infer<typeof TopicPath>;
  readonly persistence = new Observable<TPersistence | undefined>(undefined);

  constructor(
    public readonly id: z.infer<typeof TopicId>,
    path: z.infer<typeof TopicPath>,
    contentType: string,
    persistence?: TPersistence,
    public readonly isReadOnly = false,
  ) {
    try {
      this.path = TopicPath.parse(path);
      Object.freeze(this.path);

      this.contentType = ContentType.parse(contentType);
    } catch (error) {
      throw new Error(
        `failed to construct topic\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }

    this.persistence.value = persistence;

    logger.info(
      { id: this.id },
      `constructed Topic with ID '${this.id}' and path '${this.path.join('.')}'`,
    );
  }

  private async _setPayloadEmpty() {
    this._state = undefined;

    if (environment.FORWARD_STRATEGY === ForwardStrategy.TEE) {
      this._stateRefresh.trigger();
    }

    const [error] = await safeAsync(this.persistence.value?.set(undefined));
    if (error) throw error;

    if (environment.FORWARD_STRATEGY === ForwardStrategy.STORE_AND_FORWARD) {
      this._stateRefresh.trigger();
    }
  }

  private async _setPayloadStoreAndForward(stream: Readable, length: number) {
    if (this.persistence.value) {
      const [error] = await safeAsync(this.persistence.value.set(stream));
      if (error) throw error;

      if (!this._stateRefresh.listeners) return;

      await sleep(0);
      this._state = await this.persistence.value.stream;
    } else {
      const [error, payload] = await safeAsync(buffer(stream));
      if (error) throw error;

      if (!this._stateRefresh.listeners) return;

      this._state = payload
        ? {
            length,
            stream: createReadableFromValue(payload),
          }
        : undefined;
    }

    this._stateRefresh.trigger();

    if (this._state) {
      const [error] = await safeAsync(buffer(this._state.stream));
      if (error) throw error;
    }
  }

  private async _setPayloadTee(stream: Readable, length: number) {
    const tee = piggybackReadable(stream);

    this._state = tee
      ? {
          length,
          stream: tee,
        }
      : undefined;

    this._stateRefresh.trigger();

    if (this.persistence.value) {
      const [error] = await safeAsync(this.persistence.value.set(stream));
      if (error) throw error;
    } else {
      const [error] = await safeAsync(buffer(stream));
      if (error) throw error;
    }
  }

  async getPayload<T extends GetPayloadType>(
    type: T,
    abort?: AbortController,
  ): Promise<GetPayloadResult<T>> {
    let observer: Observer | undefined;

    try {
      const { promise, resolve } = Promise.withResolvers<GetPayloadResult<T>>();

      const needsTruthyValueToResolve = [
        GetPayloadType.FUTURE_NON_EMPTY,
        GetPayloadType.NON_EMPTY,
      ].includes(type);

      if (
        [
          GetPayloadType.ALL,
          GetPayloadType.FUTURE_NON_EMPTY,
          GetPayloadType.FUTURE,
          GetPayloadType.NON_EMPTY,
        ].includes(type)
      ) {
        observer = this._stateRefresh.observe(() => {
          if (abort?.signal.aborted) return;
          if (needsTruthyValueToResolve && !this._state) {
            return;
          }

          observer?.remove();

          resolve(this._state as GetPayloadResult<T>);
        });
      }

      if (
        [
          GetPayloadType.ALL,
          GetPayloadType.NON_EMPTY,
          GetPayloadType.PERSISTED,
        ].includes(type)
      ) {
        (async () => {
          const { stream } = this.persistence.value ?? {};

          const value = await stream;

          if (abort?.signal.aborted) return;
          if (needsTruthyValueToResolve && !value) return;

          observer?.remove();
          resolve(value as GetPayloadResult<T>);
        })();
      }

      abort?.signal.addEventListener('abort', () => {
        observer?.remove();

        logger.info(
          { id: this.id, path: this.path, type },
          `aborted getting payload for topic '${this.id}'/'${this.path.join('.')}' with type '${type}'`,
        );
      });

      const [error, result] = await safeAsync(promise);
      if (error) throw error;

      return result;
    } catch (error) {
      observer?.remove();

      throw new Error(
        `failed to get payload\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }
  }

  streamPayloads<T extends GetPayloadTypeStreamable>(
    type: T,
    abort?: AbortController,
  ): ReadOnlyNullState<GetPayloadResult<T>> {
    let observer: Observer | undefined;

    const state = new NullState<GetPayloadResult<T>>();

    try {
      const needsTruthyValueToResolve = [
        GetPayloadType.FUTURE_NON_EMPTY,
        GetPayloadType.NON_EMPTY,
      ].includes(type);

      if (
        [
          GetPayloadType.ALL,
          GetPayloadType.FUTURE_NON_EMPTY,
          GetPayloadType.FUTURE,
          GetPayloadType.NON_EMPTY,
        ].includes(type)
      ) {
        observer = this._stateRefresh.observe(() => {
          if (abort?.signal.aborted) return;
          if (needsTruthyValueToResolve && !this._state) {
            return;
          }

          state.trigger(this._state as GetPayloadResult<T>);
        });
      }

      if ([GetPayloadType.ALL, GetPayloadType.NON_EMPTY].includes(type)) {
        (async () => {
          const { stream } = this.persistence.value ?? {};
          if (stream) {
            const value = await stream;

            if (abort?.signal.aborted) return;
            if (needsTruthyValueToResolve && !value) return;

            state.trigger(value as GetPayloadResult<T>);
          }
        })();
      }

      abort?.signal.addEventListener('abort', () => {
        observer?.remove();

        logger.info(
          { id: this.id, path: this.path, type },
          `aborted streaming payload for topic '${this.id}'/'${this.path.join('.')}' with type '${type}'`,
        );
      });

      return new ReadOnlyNullState(state);
    } catch (error) {
      observer?.remove();

      throw new Error(
        `failed to stream payloads\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  async setPayload(value: ReadableStreamWithLength | undefined): Promise<void> {
    const { length, stream } = value ?? {};

    if (this._state) {
      logger.warn('denying set payload while other upload is taking place');

      throw new ServiceUnavailableError('upload in progress');
    }

    if (length === 0) {
      logger.warn('not ingesting zero-length stream as payload');

      return;
    }

    try {
      if (!length || !stream) {
        this._setPayloadEmpty();

        return;
      }

      abortOnLengthExceeeded(stream, length);
      const end = awaitEnd(stream);

      // eslint-disable-next-line default-case
      switch (environment.FORWARD_STRATEGY) {
        case ForwardStrategy.TEE: {
          this._setPayloadTee(stream, length);

          break;
        }

        case ForwardStrategy.STORE_AND_FORWARD: {
          this._setPayloadStoreAndForward(stream, length);

          break;
        }
      }

      stream.once('error', (error) => {
        this._state = undefined;
        throw new Error('stream error', { cause: error });
      });

      const [error] = await safeAsync(end);
      this._state = undefined;

      if (error) throw error;
    } catch (error) {
      throw new Error(
        `failed to set payload\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }
  }
}
