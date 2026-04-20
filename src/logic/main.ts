import { randomUUID } from 'node:crypto';

import z from 'zod';

import {
  ConflictError,
  InternalServerError,
  NotFoundError,
} from '../endpoints/error.js';
import { ContentType, environment, PersistenceType } from '../environment.js';
import { makeLogger } from '../logging.js';
import { PersistenceFilesystem } from './persistence/filesystem.js';
import { Expiration, PersistenceMemory } from './persistence/main.js';
import { config, findTopic, topics } from './state.js';
import { Topic, TopicId, TopicPath } from './topic.js';

const logger = makeLogger(import.meta.filename);

export const addTopic = async (
  topicPath: z.infer<typeof TopicPath>,
  contentType: z.infer<typeof ContentType>,
  topicId: z.infer<typeof TopicId> = randomUUID(),
  persistence?: boolean,
  expiration?: z.infer<typeof Expiration>,
  body?: unknown,
): Promise<Topic> => {
  try {
    if (findTopic(topicPath)) {
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
    );

    topics.add(topic);
    config.set(topic.id, [
      topic.path,
      topic.contentType,
      Boolean(topic.persistence.value),
      topic.persistence.value?.expiration.value,
    ] as const);

    if (body instanceof Buffer) await topic.persistence.value?.set(body);

    return topic;
  } catch (error) {
    logger.error(error);

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
  body?: unknown,
): Promise<Topic | undefined> => {
  try {
    const topic = findTopic(topicPath);
    if (!topic) {
      throw new NotFoundError(
        `topic with path '${topicPath.join('.')}' does not exist`,
      );
    }

    if (persistence === true && !topic.persistence.value) {
      switch (environment.PERSISTENCE_TYPE) {
        case PersistenceType.MEMORY: {
          topic.persistence.value = new PersistenceMemory(expiration);
          break;
        }
        case PersistenceType.FILESYSTEM: {
          topic.persistence.value = new PersistenceFilesystem(
            topic.id,
            expiration,
          );
          break;
        }
        default:
      }
    } else if (persistence === false) {
      await topic.persistence.value?.remove();
      topic.persistence.value = undefined;
    }

    if (topic.persistence.value && expiration !== undefined) {
      topic.persistence.value.expiration.value =
        expiration === 0 ? undefined : expiration;
    }

    if (body instanceof Buffer) await topic.persistence.value?.set(body);

    config.set(topic.id, [
      topic.path,
      topic.contentType,
      Boolean(topic.persistence.value),
      topic.persistence.value?.expiration.value,
    ] as const);

    return topic;
  } catch (error) {
    logger.error(error);

    throw new InternalServerError(
      `failed to modify topic\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};

export const removeTopic = (
  topicPath: z.infer<typeof TopicPath>,
): Topic | undefined => {
  try {
    const topic = findTopic(topicPath);
    if (!topic) {
      throw new NotFoundError(
        `topic with path '${topicPath.join('.')}' does not exist`,
      );
    }

    topics.delete(topic);
    config.delete(topic.id);

    return topic;
  } catch (error) {
    logger.error(error);

    throw new InternalServerError(
      `failed to remove topic\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
