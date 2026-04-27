import { Observable, ReadOnlyObservable } from '@mrpelz/observable';
import z from 'zod';

import { makeLogger } from '../../logging.js';
import { Topic } from '../topic/topic.js';

const logger = makeLogger(import.meta.filename);

export const ConsumerPath = z.array(z.string()).default([]);

export class Consumer {
  private readonly _abort = new AbortController();
  private readonly _topics = new Observable<Topic[]>([]);

  readonly path: z.infer<typeof ConsumerPath>;
  readonly topics = new ReadOnlyObservable(this._topics);

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

  setTopics(topics: Topic[]): void {
    this._abort.abort();

    this._topics.value = topics;
  }
}
