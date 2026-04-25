import z from 'zod';

import { InternalServerError, NotFoundError } from '../../endpoints/error.js';
import { makeLogger } from '../../logging.js';
import { findTopicByPath } from '../topic/state.js';
import { Topic, TopicPath } from '../topic/topic.js';

const logger = makeLogger(import.meta.filename);

export const getConsumer = (topicPath: z.infer<typeof TopicPath>): Topic => {
  try {
    const topic = findTopicByPath(topicPath);
    if (!topic) {
      throw new NotFoundError(
        `topic with path '${topicPath.join('.')}' does not exist`,
      );
    }

    return topic;
  } catch (error) {
    logger.error(error);

    throw new InternalServerError(
      `failed to get topic\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
