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

export const getConsumerPayload = async (
  consumerPath: z.infer<typeof ConsumerPath>,
  opportunistic = false,
  type: GetPayloadType = GetPayloadType.ALL,
  abort = new AbortController(),
): Promise<readonly [Topic, Readable | undefined]> => {
  try {
    if (!opportunistic && TopicPath.safeParse(consumerPath).success) {
      const [error, result] = await safeAsync(
        getTopicPayload(consumerPath, type, abort),
      );
      if (error) throw error;

      return result;
    }

    const consumer = new Consumer(consumerPath);

    consumers.add(consumer);
    matchConsumerToTopic.trigger();

    abort.signal.addEventListener('abort', () => {
      consumers.delete(consumer);
    });

    if (!opportunistic && consumer.topics.value.length === 0) {
      consumers.delete(consumer);

      throw new NotFoundError(
        `consumer with path '${consumerPath.join('.')}' has no matches`,
      );
    }

    const [error, result] = await safeAsync(
      consumer.getPayload(opportunistic, type, abort),
    );
    if (error) throw error;

    consumers.delete(consumer);

    return result;
  } catch (error) {
    abort.abort();

    throw new InternalServerError(
      `failed to get consumer payload\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
