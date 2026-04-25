import z from 'zod';

import { InternalServerError, NotFoundError } from '../../endpoints/error.js';
import { makeLogger } from '../../logging.js';
import { Topic } from '../topic/topic.js';
import { Consumer, ConsumerPath } from './consumer.js';
import { consumers, matchConsumerToTopic } from './state.js';

const logger = makeLogger(import.meta.filename);

const getFirstEventualTopicPayload = (topics: Topic[]) =>
  Promise.race(
    topics.map(
      async (topic) => [topic, await topic.eventualPayload()] as const,
    ),
  );

export const getConsumerPayload = async (
  consumerPath: z.infer<typeof ConsumerPath>,
  opportunistic = false,
): Promise<readonly [Topic, Buffer | undefined]> => {
  try {
    const consumer = new Consumer(consumerPath);

    consumers.add(consumer);
    matchConsumerToTopic.trigger();

    if (!opportunistic) {
      if (consumer.topics.value.length === 0) {
        throw new NotFoundError(
          `consumer with path '${consumerPath.join('.')}' has no matches`,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const topic = consumer.topics.value.at(0)!;

      consumers.delete(consumer);
      return [topic, await topic.persistence.value?.value] as const;
    }

    const { promise, resolve } =
      Promise.withResolvers<readonly [Topic, Buffer | undefined]>();

    consumer.topics.observe(async (topics, observer) => {
      resolve(await getFirstEventualTopicPayload(topics));
      observer.remove();
    });

    resolve(getFirstEventualTopicPayload(consumer.topics.value));

    const result = await promise;
    consumers.delete(consumer);

    return result;
  } catch (error) {
    logger.error(error);

    throw new InternalServerError(
      `failed to get consumer payload\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
