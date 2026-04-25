import z from 'zod';

import { makeLogger } from '../../logging.js';
import { Topic } from '../topic/topic.js';

const logger = makeLogger(import.meta.filename);

export const ConsumerPath = z.array(z.string()).default([]);

export class Consumer {
  readonly path: z.infer<typeof ConsumerPath>;
  readonly topics = new Set<Topic>();

  constructor(path: z.infer<typeof ConsumerPath>, opportunistic = false) {
    try {
      this.path = ConsumerPath.parse(path);
      Object.freeze(this.path);
    } catch (error) {
      logger.error(error);

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
}
