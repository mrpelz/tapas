import { Readable } from 'node:stream';

import { Observable } from '@mrpelz/observable';
import z from 'zod';

import { safeAsync } from '../../async.js';
import { InternalServerError } from '../../endpoints/error.js';
import { makeLogger } from '../../logging.js';
import { GetPayloadType, Topic } from '../topic/topic.js';

const logger = makeLogger(import.meta.filename);

export const ConsumerPath = z.array(z.string()).default([]);

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

  private _getFirstEventualTopicPayload(
    type: GetPayloadType,
    abort?: AbortController,
  ) {
    return Promise.race(
      this.topics.value.map(
        async (topic) => [topic, await topic.getPayload(type, abort)] as const,
      ),
    );
  }

  async getPayload(
    opportunistic: boolean,
    type: GetPayloadType,
    abort: AbortController,
  ): Promise<readonly [Topic, Readable | undefined]> {
    try {
      const { promise, resolve, reject } =
        Promise.withResolvers<readonly [Topic, Readable | undefined]>();

      let renewedAbort: AbortController | undefined;

      const observer = opportunistic
        ? this.topics.observe(async () => {
            renewedAbort?.abort();

            renewedAbort = new AbortController();
            abort.signal.addEventListener('abort', () => renewedAbort?.abort());

            const [error, result] = await safeAsync(
              this._getFirstEventualTopicPayload(type, abort),
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
}
