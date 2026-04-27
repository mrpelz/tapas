import { Readable } from 'node:stream';

import z from 'zod';

import { safeAsync } from '../../async.js';
import { InternalServerError, NotFoundError } from '../../endpoints/error.js';
import { makeLogger } from '../../logging.js';
import { getTopicPayload } from '../topic/main.js';
import { GetPayloadType, Topic, TopicPath } from '../topic/topic.js';
import { Consumer, ConsumerPath } from './consumer.js';
import { consumers, matchConsumerToTopic } from './state.js';

const _logger = makeLogger(import.meta.filename);

const getFirstEventualTopicPayload = (topics: Topic[], type: GetPayloadType) =>
  Promise.race(
    topics.map(async (topic) => [topic, await topic.getPayload(type)] as const),
  );

export const getConsumerPayload = async (
  consumerPath: z.infer<typeof ConsumerPath>,
  opportunistic = false,
  type: GetPayloadType = GetPayloadType.ALL,
): Promise<readonly [Topic, Readable | undefined]> => {
  try {
    if (!opportunistic && TopicPath.safeParse(consumerPath).success) {
      const [error, result] = await safeAsync(
        getTopicPayload(consumerPath, type),
      );
      if (error) throw error;

      return result;
    }

    const consumer = new Consumer(consumerPath);

    consumers.add(consumer);
    matchConsumerToTopic.trigger();

    if (!opportunistic && consumer.topics.value.length === 0) {
      consumers.delete(consumer);

      throw new NotFoundError(
        `consumer with path '${consumerPath.join('.')}' has no matches`,
      );
    }

    const { promise, resolve, reject } =
      Promise.withResolvers<readonly [Topic, Readable | undefined]>();

    const observer = opportunistic
      ? consumer.topics.observe(async (topics) => {
          const [error, result] = await safeAsync(
            getFirstEventualTopicPayload(topics, type),
          );

          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        })
      : undefined;

    (async () => {
      const [error, result] = await safeAsync(
        getFirstEventualTopicPayload(consumer.topics.value, type),
      );

      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    })();

    const [error, result] = await safeAsync(promise);

    observer?.remove();
    consumers.delete(consumer);

    if (error) throw error;

    return result;
  } catch (error) {
    throw new InternalServerError(
      `failed to get consumer payload\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};

export const streamConsumerPayloads = async (
  consumerPath: z.infer<typeof ConsumerPath>,
  opportunistic = false,
  type: GetPayloadType = GetPayloadType.ALL,
): Promise<readonly [Topic, Readable | undefined]> => {
  try {
    if (!opportunistic && TopicPath.safeParse(consumerPath).success) {
      const [error, result] = await safeAsync(
        getTopicPayload(consumerPath, type),
      );
      if (error) throw error;

      return result;
    }

    const consumer = new Consumer(consumerPath);

    consumers.add(consumer);
    matchConsumerToTopic.trigger();

    if (!opportunistic && consumer.topics.value.length === 0) {
      consumers.delete(consumer);

      throw new NotFoundError(
        `consumer with path '${consumerPath.join('.')}' has no matches`,
      );
    }

    const { promise, resolve, reject } =
      Promise.withResolvers<readonly [Topic, Readable | undefined]>();

    const observer = opportunistic
      ? consumer.topics.observe(async (topics) => {
          const [error, result] = await safeAsync(
            getFirstEventualTopicPayload(topics, type),
          );

          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        })
      : undefined;

    (async () => {
      const [error, result] = await safeAsync(
        getFirstEventualTopicPayload(consumer.topics.value, type),
      );

      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    })();

    const [error, result] = await safeAsync(promise);

    observer?.remove();
    consumers.delete(consumer);

    if (error) throw error;

    return result;
  } catch (error) {
    throw new InternalServerError(
      `failed to get consumer payload\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
