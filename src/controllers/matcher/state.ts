import { NullState } from '@mrpelz/observable/state';
import z from 'zod';

import { makeLogger } from '../../logging.js';
import { findTopicByPath, topics } from '../topic/state.js';
import { Topic, TopicPath } from '../topic/topic.js';
import { Consumer, ConsumerPath } from './consumer.js';

const logger = makeLogger(import.meta.filename);

export const consumers = new Set<Consumer>();

export const findTopicsByWildcardPath = (
  consumerPath: z.infer<typeof ConsumerPath>,
): Set<Topic> => {
  const result = new Set<Topic>();

  for (const topic of topics) {
    // noop
  }

  return result;
};

const pairConsumerToTopic = new NullState(() => {
  for (const consumer of consumers) {
    consumer.topics.clear();

    const directMatch = TopicPath.safeParse(consumer.path).success
      ? findTopicByPath(consumer.path)
      : undefined;

    if (directMatch) {
      consumer.topics.add(directMatch);

      return;
    }

    for (const topic of findTopicsByWildcardPath(consumer.path)) {
      consumer.topics.add(topic);
    }
  }
});
