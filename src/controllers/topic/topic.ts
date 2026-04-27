import { Readable } from 'node:stream';

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

export type GetPayloadResult<T extends GetPayloadType> = T extends
  | GetPayloadType.FUTURE_NON_EMPTY
  | GetPayloadType.NON_EMPTY
  ? Readable
  : Readable | undefined;

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

export class Topic {
  private readonly _state = new NullState<Readable | undefined>();

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

  getPayload<T extends GetPayloadType>(
    type: T,
    abort?: AbortSignal,
  ): Promise<GetPayloadResult<T>> {
    const { promise, resolve } = Promise.withResolvers<GetPayloadResult<T>>();

    const needsTruthyValueToResolve = [
      GetPayloadType.FUTURE_NON_EMPTY,
      GetPayloadType.NON_EMPTY,
    ].includes(type);

    let observer: Observer | undefined;

    if (
      [
        GetPayloadType.ALL,
        GetPayloadType.FUTURE_NON_EMPTY,
        GetPayloadType.FUTURE,
        GetPayloadType.NON_EMPTY,
      ].includes(type)
    ) {
      observer = this._state.observe((value) => {
        if (abort?.aborted) return;
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

          if (abort?.aborted) return;
          if (needsTruthyValueToResolve && !value) return;

          observer?.remove();
          resolve(value as GetPayloadResult<T>);
        }
      })();
    }

    abort?.addEventListener('abort', () => observer?.remove());

    return promise;
  }

  async setPayload(value: Readable | undefined): Promise<void> {
    try {
      this._state.trigger(value);

      const [error] = await safeAsync(this.persistence.value?.set(value));
      if (error) throw error;
    } catch (error) {
      throw new Error(
        `failed to set payload\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }
  }
}
