import { Observable } from '@mrpelz/observable';
import { NullState, ReadOnlyNullState } from '@mrpelz/observable/state';
import z from 'zod';

import { safeAsync } from '../../async.js';
import { InternalServerError } from '../../endpoints/error.js';
import { makeLogger } from '../../logging.js';
import { registry } from '../../openapi.js';
import {
  futurizePayloadType,
  GetPayloadType,
  GetPayloadTypeStreamable,
  Topic,
} from '../topic/topic.js';

const logger = makeLogger(import.meta.filename);

export const ConsumerPath = z
  .array(z.string())
  .default([])
  .openapi({
    description: String.raw`wildcard path: '*' at the end of the path matches all more specific topic paths, '+' matches with all topic path items in the same position`,
  });
registry.register('ConsumerPath', ConsumerPath);

export class Consumer {
  readonly path: z.infer<typeof ConsumerPath>;
  readonly topics = new Observable<Topic[]>([]);

  constructor(path: z.infer<typeof ConsumerPath>) {
    try {
      this.path = ConsumerPath.parse(path);
      Object.freeze(this.path);

      this.topics.observe((topics) => {
        logger.info(
          { topics: topics.map((topic) => topic.path.join('.')) },
          `matched path '${path.join('.')}' to topics`,
        );
      });
    } catch (error) {
      throw new Error(
        `failed to construct consumer\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }

    logger.info(
      { path: this.path },
      `constructed Consumer with path '${this.path.join('.')}'`,
    );
  }

  private _getAllEventualTopicPayloads(
    type: GetPayloadType,
    abort: AbortController,
  ) {
    return Promise.allSettled(
      this.topics.value.map(
        async (topic) => [topic, await topic.getPayload(type, abort)] as const,
      ),
    ).then((value) =>
      value
        .filter(({ status }) => status === 'fulfilled')
        .map(
          (result) =>
            (result as Exclude<typeof result, PromiseRejectedResult>).value,
        ),
    );
  }

  private _getFirstEventualTopicPayload(
    type: GetPayloadType,
    abort: AbortController,
  ) {
    return Promise.race(
      this.topics.value.map(
        async (topic) => [topic, await topic.getPayload(type, abort)] as const,
      ),
    );
  }

  async getAllPayloads(
    opportunistic: boolean,
    type: GetPayloadType,
    abort: AbortController,
  ): Promise<(readonly [Topic, ReadableStream | undefined])[]> {
    try {
      const { promise, resolve, reject } =
        // eslint-disable-next-line prettier/prettier
        Promise.withResolvers<(readonly [Topic, ReadableStream | undefined])[]>();

      let renewedAbort: AbortController | undefined;
      abort.signal.addEventListener('abort', () => renewedAbort?.abort());

      const observer = opportunistic
        ? this.topics.observe(async () => {
            renewedAbort?.abort();
            renewedAbort = new AbortController();

            const [error, result] = await safeAsync(
              this._getAllEventualTopicPayloads(type, renewedAbort),
            );

            if (error) {
              reject(error);
              return;
            }

            resolve(result);
          })
        : undefined;

      abort.signal.addEventListener('abort', () => {
        observer?.remove();

        logger.info(
          { path: this.path, type },
          `aborted getting all payloads for consumer '${this.path.join(
            '.',
          )}' with type '${type}'`,
        );
      });

      (async () => {
        const [error, result] = await safeAsync(
          this._getAllEventualTopicPayloads(type, abort),
        );

        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      })();

      const [error, result] = await safeAsync(promise);
      if (error) throw error;

      observer?.remove();

      return result;
    } catch (error) {
      abort.abort();

      throw new InternalServerError(
        `failed to get all payloads\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }
  }

  async getPayload(
    opportunistic: boolean,
    type: GetPayloadType,
    abort: AbortController,
  ): Promise<readonly [Topic, ReadableStream | undefined]> {
    try {
      const { promise, resolve, reject } =
        Promise.withResolvers<readonly [Topic, ReadableStream | undefined]>();

      let renewedAbort: AbortController | undefined;
      abort.signal.addEventListener('abort', () => renewedAbort?.abort());

      const observer = opportunistic
        ? this.topics.observe(async () => {
            renewedAbort?.abort();
            renewedAbort = new AbortController();

            const [error, result] = await safeAsync(
              this._getFirstEventualTopicPayload(type, renewedAbort),
            );

            if (error) {
              reject(error);
              return;
            }

            resolve(result);
          })
        : undefined;

      abort.signal.addEventListener('abort', () => {
        observer?.remove();

        logger.info(
          { path: this.path, type },
          `aborted getting payload for consumer '${this.path.join(
            '.',
          )}' with type '${type}'`,
        );
      });

      (async () => {
        const [error, result] = await safeAsync(
          this._getFirstEventualTopicPayload(type, abort),
        );

        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      })();

      const [error, result] = await safeAsync(promise);
      if (error) throw error;

      observer?.remove();

      return result;
    } catch (error) {
      abort.abort();

      throw new InternalServerError(
        `failed to get payload\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }
  }

  streamPayloads(
    type: GetPayloadTypeStreamable,
    abort: AbortController,
  ): ReadOnlyNullState<readonly [Topic, ReadableStream | undefined]> {
    try {
      let renewedAbort = new AbortController();
      abort.signal.addEventListener('abort', () => renewedAbort?.abort());

      const state = new NullState<[Topic, ReadableStream | undefined]>();
      const typeFuturized = futurizePayloadType(type);

      const topicsObserver = this.topics.observe((topics) => {
        renewedAbort?.abort();
        renewedAbort = new AbortController();

        for (const topic of topics) {
          const observer = topic
            .streamPayloads(typeFuturized, renewedAbort)
            .observe((value) => {
              state.trigger([topic, value]);
            });

          renewedAbort.signal.addEventListener('abort', () =>
            observer.remove(),
          );
        }
      });

      abort.signal.addEventListener('abort', () => {
        topicsObserver.remove();

        logger.info(
          { path: this.path, type },
          `aborted streaming payloads for consumer '${this.path.join(
            '.',
          )}' with type '${type}'`,
        );
      });

      for (const topic of this.topics.value) {
        const observer = topic
          .streamPayloads(type, renewedAbort)
          .observe((value) => {
            state.trigger([topic, value]);
          });

        renewedAbort.signal.addEventListener('abort', () => observer.remove());
      }

      return new ReadOnlyNullState(state);
    } catch (error) {
      abort.abort();

      throw new InternalServerError(
        `failed to stream payloads\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }
  }
}
