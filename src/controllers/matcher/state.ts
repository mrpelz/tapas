import { arrayCompare } from '@mrpelz/misc-utils/data';
import { NullState } from '@mrpelz/observable/state';
import z from 'zod';

import { makeLogger } from '../../logging.js';
import { findTopicByPath, topics } from '../topic/state.js';
import { Topic, TopicPath } from '../topic/topic.js';
import { Consumer, ConsumerPath } from './consumer.js';

const _logger = makeLogger(import.meta.filename);

export const consumers = new Set<Consumer>();

export const findConsumerByPath = (
  consumerPath: z.infer<typeof ConsumerPath>,
): Consumer | undefined => {
  for (const consumer of consumers) {
    if (arrayCompare(consumer.path, consumerPath)) return consumer;
  }

  return undefined;
};

const matchWildcardPath = (
  topicPath: z.infer<typeof TopicPath>,
  consumerPath: z.infer<typeof ConsumerPath>,
) => {
  for (let i = 0; i < consumerPath.length; i += 1) {
    const left = consumerPath.at(i);
    const right = topicPath.at(i);

    if (left === '*') return topicPath.length >= consumerPath.length - 1;
    if (left !== '+' && left !== right) return false;
  }

  return consumerPath.length === topicPath.length;
};

export const findTopicsByWildcardPath = (
  consumerPath: z.infer<typeof ConsumerPath>,
): Topic[] =>
  Array.from(topics).filter((topic) =>
    matchWildcardPath(topic.path, consumerPath),
  );

export const matchConsumerToTopic = new NullState(() => {
  for (const consumer of consumers) {
    const directMatch = TopicPath.safeParse(consumer.path).success
      ? findTopicByPath(consumer.path)
      : undefined;

    if (directMatch) {
      consumer.topics.value = [directMatch];

      return;
    }

    consumer.topics.value = findTopicsByWildcardPath(consumer.path);
  }
});
