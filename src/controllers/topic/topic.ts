import { Readable } from 'node:stream';

import { Observable } from '@mrpelz/observable';
import { NullState, ReadOnlyNullState } from '@mrpelz/observable/state';
import z from 'zod';

import { safeAsync } from '../../async.js';
import { ContentType } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { TPersistence } from '../persistence/main.js';

const logger = makeLogger(import.meta.filename);

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
      logger.error(error);

      throw new Error(
        `failed to construct topic\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }

    this.persistence.value = persistence;

    logger.info({ id: this.id }, `constructed Topic with ID '${this.id}'`);
  }

  async eventualPayload(): Promise<Readable> {
    const { promise, resolve } = Promise.withResolvers<Readable>();

    const observer = this._state.observe((value) => {
      if (!value) return;

      observer.remove();
      resolve(value);
    });

    const { stream: persistence } = this.persistence.value ?? {};
    if (persistence) {
      const value = await persistence;

      if (value) {
        observer.remove();
        resolve(value);
      }
    }

    return promise;
  }

  async setPayload(value: Readable | undefined): Promise<void> {
    try {
      this._state.trigger(value);

      const [error] = await safeAsync(this.persistence.value?.set(value));
      if (error) throw error;
    } catch (error) {
      logger.error(error);

      throw new Error(
        `failed to set payload\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }
  }
}
