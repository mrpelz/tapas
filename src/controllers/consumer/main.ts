import { NullState, ReadOnlyNullState } from '@mrpelz/observable/state';
import z from 'zod';

import { InternalServerError, NotFoundError } from '../../endpoints/error.js';
import { makeLogger } from '../../logging.js';
import { safeAsync } from '../../utils.js';
import { getTopicPayload, streamTopicPayloads } from '../topic/main.js';
import { findTopicByPath } from '../topic/state.js';
import {
  GetPayloadType,
  GetPayloadTypeStreamable,
  ReadableStreamWithLength,
  Topic,
  TopicPath,
} from '../topic/topic.js';
import { Consumer, ConsumerPath } from './consumer.js';
import { consumers, matchConsumerToTopic } from './state.js';

const _logger = makeLogger(import.meta.filename);

export const getConsumerTopic = (
  consumerPath: z.infer<typeof ConsumerPath>,
): Topic | undefined => {
  try {
    if (!TopicPath.safeParse(consumerPath).success) return undefined;

    return findTopicByPath(consumerPath);
  } catch (error) {
    throw new InternalServerError(
      `failed to get consumer topic\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};

export const getAllConsumerPayloads = async (
  consumerPath: z.infer<typeof ConsumerPath>,
  opportunistic = false,
  type: GetPayloadType = GetPayloadType.ALL,
  abort = new AbortController(),
): Promise<(readonly [Topic, ReadableStreamWithLength | undefined])[]> => {
  try {
    if (!opportunistic && TopicPath.safeParse(consumerPath).success) {
      const [error, result] = await safeAsync(
        getTopicPayload(consumerPath, type, abort),
      );
      if (error) throw error;

      return [result];
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
      consumer.getAllPayloads(opportunistic, type, abort),
    );
    if (error) throw error;

    consumers.delete(consumer);

    return result;
  } catch (error) {
    abort.abort();

    throw new InternalServerError(
      `failed to get all consumer payloads\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};

export const getConsumerPayload = async (
  consumerPath: z.infer<typeof ConsumerPath>,
  opportunistic = false,
  type: GetPayloadType = GetPayloadType.ALL,
  abort = new AbortController(),
): Promise<readonly [Topic, ReadableStreamWithLength | undefined]> => {
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

export const streamConsumerPayloads = (
  consumerPath: z.infer<typeof ConsumerPath>,
  opportunistic = false,
  type: GetPayloadTypeStreamable = GetPayloadType.ALL,
  abort = new AbortController(),
): ReadOnlyNullState<
  readonly [Topic, ReadableStreamWithLength | undefined]
> => {
  try {
    if (!opportunistic && TopicPath.safeParse(consumerPath).success) {
      const state = new NullState<
        readonly [Topic, ReadableStreamWithLength | undefined]
      >();

      const [topic, payloads] = streamTopicPayloads(consumerPath, type, abort);

      const observer = payloads.observe((value) => {
        state.trigger([topic, value] as const);
      });

      abort.signal.addEventListener('abort', () => observer.remove());

      return new ReadOnlyNullState(state);
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

    return consumer.streamPayloads(type, abort);
  } catch (error) {
    abort.abort();

    throw new InternalServerError(
      `failed to stream consumer payloads\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
