import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { arrayCompare } from '@mrpelz/misc-utils/data';
import z from 'zod';

import { safeAsync } from '../../async.js';
import {
  ContentType,
  environment,
  Expiration,
  PersistenceType,
} from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { directory } from '../persistence/filesystem.js';
import { s3client } from '../persistence/s3.js';
import { addTopic } from './main.js';
import { type Topic, TopicId, TopicPath } from './topic.js';

const logger = makeLogger(import.meta.filename);

const STATE_FILE = 'state.json';

const SerializedStateElement = z.tuple([
  TopicPath,
  ContentType,
  z.boolean(),
  z.union([z.literal(0), Expiration]),
]);
const SerializedState = z.record(TopicId, SerializedStateElement);

const stateFilePath =
  environment.PERSISTENCE_TYPE === PersistenceType.FILESYSTEM && directory
    ? path.join(directory, STATE_FILE)
    : undefined;

if (stateFilePath) {
  logger.info(`using state file '${stateFilePath}'`);
}

const topicsFilePath = environment.TOPICS_FILE
  ? path.resolve(process.cwd(), environment.TOPICS_FILE)
  : undefined;

if (topicsFilePath) {
  logger.info(`using topics file '${topicsFilePath}'`);
}

export const topics = new Set<Topic>();

export const findTopicByPath = (
  topicPath: z.infer<typeof TopicPath>,
): Topic | undefined => {
  for (const topic of topics) {
    if (arrayCompare(topic.path, topicPath)) return topic;
  }

  return undefined;
};

export const findTopicById = (
  topicId: z.infer<typeof TopicId>,
): Topic | undefined => {
  for (const topic of topics) {
    if (topic.id === topicId) return topic;
  }

  return undefined;
};

export const loadTopicsFile = async (): Promise<void> => {
  try {
    if (!topicsFilePath) return;
    if (!existsSync(topicsFilePath)) {
      throw new Error(`topics file '${topicsFilePath}' doesn’t exist`);
    }

    const [error, payload] = await safeAsync(readFile(topicsFilePath, 'utf8'));
    if (error) throw error;

    if (payload.trim().length === 0) return;

    const stored = SerializedState.parse(JSON.parse(payload));

    for (const [
      topicId,
      [topicPath, contentType, persist, expiration],
    ] of Object.entries(stored)) {
      addTopic(
        topicPath,
        contentType,
        topicId,
        persist,
        expiration || undefined,
        true,
      );
    }
  } catch (error) {
    throw new Error(
      `failed to load topics file\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }

  logger.info('loaded topics file');
};

export const restoreState = async (): Promise<void> => {
  try {
    if (!environment.ALLOW_DYNAMIC_TOPICS) {
      // no need to restore state if dynamic topics are not allowed
      logger.info('dynamic topics are not allowed, not restoring state');

      return;
    }

    const [error, stored] = await safeAsync(
      (async () => {
        if (environment.PERSISTENCE_TYPE === PersistenceType.FILESYSTEM) {
          if (!stateFilePath) return undefined;
          if (!existsSync(stateFilePath)) return undefined;

          const payload = await readFile(stateFilePath, 'utf8');
          if (payload.trim().length === 0) return undefined;

          return JSON.parse(payload);
        }

        if (environment.PERSISTENCE_TYPE === PersistenceType.S3) {
          const exists = await s3client?.exists(STATE_FILE);
          if (!exists) return undefined;

          const response = await s3client?.getObject(STATE_FILE);
          if (!response) return undefined;

          return response.json();
        }

        return undefined;
      })(),
    );
    if (error) throw error;

    if (!stored) return;

    for (const [
      topicId,
      [topicPath, contentType, persist, expiration],
    ] of Object.entries(SerializedState.parse(stored))) {
      addTopic(
        topicPath,
        contentType,
        topicId,
        persist,
        expiration || undefined,
      );
    }
  } catch (error) {
    throw new Error(
      `failed to restore state\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }

  logger.info('restored state');
};

export const saveSate = async (): Promise<void> => {
  try {
    if (!environment.ALLOW_DYNAMIC_TOPICS) {
      // no need to save state file if dynamic topics are not allowed
      logger.info('dynamic topics are not allowed, not saving state file');

      return;
    }

    const storable = topics
      .values()
      .filter((topic) => !topic.isReadOnly)
      .map(
        (topic) =>
          [
            topic.id,
            [
              topic.path,
              topic.contentType,
              Boolean(topic.persistence),
              topic.persistence.value?.expiration.value ?? 0,
            ],
          ] as const,
      )
      .toArray();

    const payload = JSON.stringify(Object.fromEntries(storable), undefined, 2);

    if (environment.PERSISTENCE_TYPE === PersistenceType.FILESYSTEM) {
      if (!stateFilePath) return;

      const [error] = await safeAsync(
        writeFile(stateFilePath, `${payload}\n`, { encoding: 'utf8' }),
      );
      if (error) throw error;
    }

    if (environment.PERSISTENCE_TYPE === PersistenceType.S3) {
      const [error] = await safeAsync(s3client?.putObject(STATE_FILE, payload));
      if (error) throw error;
    }
  } catch (error) {
    throw new Error(
      `failed to save state\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }

  logger.info('saved state');
};
