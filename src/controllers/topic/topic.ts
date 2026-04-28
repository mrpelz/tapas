import { Observable, Observer } from '@mrpelz/observable';
import { NullState, ReadOnlyNullState } from '@mrpelz/observable/state';
import z from 'zod';

import { safeAsync } from '../../async.js';
import { ContentType } from '../../environment.js';
import { makeLogger } from '../../logging.js';
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

export type GetPayloadResult<T extends GetPayloadType> = T extends
  | GetPayloadType.FUTURE_NON_EMPTY
  | GetPayloadType.NON_EMPTY
  ? ReadableStream
  : ReadableStream | undefined;

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
  private readonly _state = new NullState<ReadableStream | undefined>();

  readonly contentType: z.infer<typeof ContentType>;
  readonly path: z.infer<typeof TopicPath>;
  readonly persistence = new Observable<TPersistence | undefined>(undefined);
  readonly state = new ReadOnlyNullState(this._state);

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

    logger.info({ id: this.id }, `constructed Topic with ID '${this.id}'`);
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
        observer = this._state.observe((value) => {
          if (abort?.signal.aborted) return;
          if (needsTruthyValueToResolve && !value) {
            return;
          }

          observer?.remove();
          resolve(value as GetPayloadResult<T>);
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
          if (stream) {
            const value = await stream;

            if (abort?.signal.aborted) return;
            if (needsTruthyValueToResolve && !value) return;

            observer?.remove();
            resolve(value as GetPayloadResult<T>);
          }
        })();
      }

      abort?.signal.addEventListener('abort', () => observer?.remove());

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
        observer = this._state.observe((value) => {
          if (abort?.signal.aborted) return;
          if (needsTruthyValueToResolve && !value) {
            return;
          }

          state.trigger(value as GetPayloadResult<T>);
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

      abort?.signal.addEventListener('abort', () => observer?.remove());

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
  async setPayload(value: ReadableStream | undefined): Promise<void> {
    try {
      const [a, b] = value?.tee() ?? [];

      this._state.trigger(a);

      const [error] = await safeAsync(this.persistence.value?.set(b));
      if (error) throw error;
    } catch (error) {
      throw new Error(
        `failed to set payload\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }
  }
}
