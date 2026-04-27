import { Readable } from 'node:stream';

import z from 'zod';

import { safeAsync } from '../../async.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from '../../endpoints/error.js';
import { makeLogger } from '../../logging.js';
import { getTopicPayload } from '../topic/main.js';
import { Topic, TopicPath } from '../topic/topic.js';
import { Consumer, ConsumerPath } from './consumer.js';
import { consumers, matchConsumerToTopic } from './state.js';

const _logger = makeLogger(import.meta.filename);

const getFirstEventualTopicPayload = (
  topics: Topic[],
  ignoreCurrent: boolean,
) =>
  Promise.race(
    topics.map(
      async (topic) =>
        [topic, await topic.eventualPayload(ignoreCurrent)] as const,
    ),
  );

export const getConsumerPayload = async (
  consumerPath: z.infer<typeof ConsumerPath>,
  opportunistic = false,
  ignoreCurrent = false,
): Promise<readonly [Topic, Readable | undefined]> => {
  try {
    if (!ignoreCurrent && TopicPath.safeParse(consumerPath).success) {
      const [error, result] = await safeAsync(getTopicPayload(consumerPath));
      if (error) throw error;

      return result;
    }

    const consumer = new Consumer(consumerPath);

    consumers.add(consumer);
    matchConsumerToTopic.trigger();

    if (!opportunistic) {
      if (ignoreCurrent) {
        throw new BadRequestError(
          String.raw`'ignoreCurrent=true' cannot be used without 'opportunistic=true'`,
        );
      }

      if (consumer.topics.value.length === 0) {
        throw new NotFoundError(
          `consumer with path '${consumerPath.join('.')}' has no matches`,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const topic = consumer.topics.value.at(0)!;

      consumers.delete(consumer);
      return [topic, await topic.persistence.value?.stream] as const;
    }

    const { promise, resolve, reject } =
      Promise.withResolvers<readonly [Topic, Readable | undefined]>();

    consumer.topics.observe(async (topics, observer) => {
      const [error, result] = await safeAsync(
        getFirstEventualTopicPayload(topics, ignoreCurrent),
      );

      observer.remove();

      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    const [directError, directResult] = await safeAsync(
      getFirstEventualTopicPayload(consumer.topics.value, ignoreCurrent),
    );

    if (directError) {
      reject(directError);
    } else {
      resolve(directResult);
    }

    const [eventualError, eventualResult] = await safeAsync(promise);

    consumers.delete(consumer);

    if (eventualError) throw eventualError;

    return eventualResult;
  } catch (error) {
    throw new InternalServerError(
      `failed to get consumer payload\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
