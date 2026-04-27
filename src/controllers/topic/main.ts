import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import z from 'zod';

import { safeAsync } from '../../async.js';
import {
  BadRequestError,
  ConflictError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
} from '../../endpoints/error.js';
import {
  ContentType,
  environment,
  Expiration,
  PersistenceType,
} from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { matchConsumerToTopic } from '../matcher/state.js';
import { PersistenceFilesystem } from '../persistence/filesystem.js';
import { PersistenceMemory } from '../persistence/main.js';
import { PersistenceS3 } from '../persistence/s3.js';
import { findTopicById, findTopicByPath, topics } from './state.js';
import { Topic, TopicId, TopicPath } from './topic.js';

const _logger = makeLogger(import.meta.filename);

export const getTopic = (topicPath: z.infer<typeof TopicPath>): Topic => {
  try {
    const topic = findTopicByPath(topicPath);
    if (!topic) {
      throw new NotFoundError(
        `topic with path '${topicPath.join('.')}' does not exist`,
      );
    }

    return topic;
  } catch (error) {
    throw new InternalServerError(
      `failed to get topic\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};

export const addTopic = async (
  topicPath: z.infer<typeof TopicPath>,
  contentType: z.infer<typeof ContentType>,
  topicId: z.infer<typeof TopicId> = randomUUID(),
  persistence?: boolean,
  expiration?: z.infer<typeof Expiration>,
  isReadOnly?: boolean,
  body?: Readable,
): Promise<Topic> => {
  try {
    if (findTopicById(topicId)) {
      throw new ConflictError(`topic with ID '${topicId}' already exists`);
    }

    if (findTopicByPath(topicPath)) {
      throw new ConflictError(
        `topic with path '${topicPath.join('.')}' already exists`,
      );
    }

    const persistenceInstance = (() => {
      if (!persistence) return undefined;

      switch (environment.PERSISTENCE_TYPE) {
        case PersistenceType.MEMORY: {
          return new PersistenceMemory(expiration);
        }
        case PersistenceType.FILESYSTEM: {
          return new PersistenceFilesystem(topicId, expiration);
        }
        case PersistenceType.S3: {
          return new PersistenceS3(topicId, expiration);
        }
        default: {
          return undefined;
        }
      }
    })();

    const topic = new Topic(
      topicId,
      topicPath,
      contentType,
      persistenceInstance,
      isReadOnly,
    );

    topics.add(topic);
    matchConsumerToTopic.trigger();

    if (body) {
      const [error] = await safeAsync(topic.setPayload(body));
      if (error) throw error;
    }

    return topic;
  } catch (error) {
    throw new InternalServerError(
      `failed to add topic\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};

export const modifyTopic = async (
  topicPath: z.infer<typeof TopicPath>,
  persistence?: boolean,
  expiration?: z.infer<typeof Expiration>,
  body?: Readable,
): Promise<Topic> => {
  try {
    if (!environment.ALLOW_DYNAMIC_TOPICS) {
      throw new MethodNotAllowedError(
        String.raw`'ALLOW_DYNAMIC_TOPICS' is false`,
      );
    }

    const topic = findTopicByPath(topicPath);
    if (!topic) {
      throw new NotFoundError(
        `topic with path '${topicPath.join('.')}' does not exist`,
      );
    }

    if (topic.isReadOnly) {
      throw new BadRequestError(
        `topic with ID '${topic.id}' is static, cannot be altered`,
      );
    }

    if (persistence === true && !topic.persistence.value) {
      topic.persistence.value = (() => {
        switch (environment.PERSISTENCE_TYPE) {
          case PersistenceType.MEMORY: {
            return new PersistenceMemory(expiration);
          }
          case PersistenceType.FILESYSTEM: {
            return new PersistenceFilesystem(topic.id, expiration);
          }
          case PersistenceType.S3: {
            return new PersistenceS3(topic.id, expiration);
          }
          default: {
            return undefined;
          }
        }
      })();
    } else if (persistence === false) {
      const [error] = await safeAsync(topic.persistence.value?.set(undefined));
      if (error) throw error;

      // eslint-disable-next-line require-atomic-updates
      topic.persistence.value = undefined;
    }

    if (topic.persistence.value && expiration !== undefined) {
      topic.persistence.value.expiration.value =
        expiration === 0 ? undefined : expiration;
    }

    if (body) {
      const [error] = await safeAsync(topic.setPayload(body));
      if (error) throw error;
    }

    return topic;
  } catch (error) {
    throw new InternalServerError(
      `failed to modify topic\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};

export const getTopicPayload = async (
  topicPath: z.infer<typeof TopicPath>,
): Promise<[Topic, Readable | undefined]> => {
  try {
    const topic = findTopicByPath(topicPath);
    if (!topic) {
      throw new NotFoundError(
        `topic with path '${topicPath.join('.')}' does not exist`,
      );
    }

    const [error, payload] = await safeAsync(topic.persistence.value?.stream);
    if (error) throw error;

    return [topic, payload];
  } catch (error) {
    throw new InternalServerError(
      `failed to get topic payload\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};

export const setTopicPayload = async (
  topicPath: z.infer<typeof TopicPath>,
  body?: Readable,
): Promise<Topic> => {
  try {
    const topic = findTopicByPath(topicPath);
    if (!topic) {
      throw new NotFoundError(
        `topic with path '${topicPath.join('.')}' does not exist`,
      );
    }

    const [error] = await safeAsync(topic.setPayload(body));
    if (error) throw error;

    return topic;
  } catch (error) {
    throw new InternalServerError(
      `failed to set topic payload\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};

export const removeTopic = async (
  topicPath: z.infer<typeof TopicPath>,
): Promise<Topic> => {
  try {
    const topic = findTopicByPath(topicPath);
    if (!topic) {
      throw new NotFoundError(
        `topic with path '${topicPath.join('.')}' does not exist`,
      );
    }

    if (topic.isReadOnly) {
      throw new BadRequestError(
        `topic with ID '${topic.id}' is static, cannot be removed`,
      );
    }

    const [error] = await safeAsync(topic.setPayload(undefined));
    if (error) throw error;

    topics.delete(topic);

    return topic;
  } catch (error) {
    throw new InternalServerError(
      `failed to remove topic\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
