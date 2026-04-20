import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { arrayCompare } from '@mrpelz/misc-utils/data';
import z from 'zod';

import { ContentType, environment, PersistenceType } from '../environment.js';
import { makeLogger } from '../logging.js';
import { addTopic } from './main.js';
import { directory } from './persistence/filesystem.js';
import { Expiration } from './persistence/main.js';
import { type Topic, TopicId, TopicPath } from './topic.js';

const logger = makeLogger(import.meta.filename);

const ConfigElement = z.tuple([
  TopicPath,
  ContentType,
  z.boolean(),
  z.union([z.literal(0), Expiration]),
]);
const Config = z.record(TopicId, ConfigElement);

const configFilePath =
  environment.PERSISTENCE_TYPE === PersistenceType.FILESYSTEM && directory
    ? path.join(directory, 'config.json')
    : undefined;

export const topics = new Set<Topic>();

export const findTopic = (
  topicPath: z.infer<typeof TopicPath>,
): Topic | undefined => {
  for (const topic of topics) {
    if (arrayCompare(topic.path, topicPath)) return topic;
  }

  return undefined;
};

export const config = new Map<
  z.infer<typeof TopicId>,
  z.infer<typeof ConfigElement>
>();

export const restoreConfig = async (): Promise<void> => {
  try {
    if (environment.PERSISTENCE_TYPE === PersistenceType.FILESYSTEM) {
      if (!configFilePath) return;
      if (!existsSync(configFilePath)) return;

      const configFilePayload = await readFile(configFilePath, 'utf8');
      if (configFilePayload.trim().length === 0) return;

      const storedConfig = Config.parse(JSON.parse(configFilePayload));

      for (const [
        topicId,
        [topicPath, contentType, persist, expiration],
      ] of Object.entries(storedConfig)) {
        addTopic(
          topicPath,
          contentType,
          topicId,
          persist,
          expiration || undefined,
        );
      }
    }
  } catch (error) {
    logger.error(error);

    throw new Error(
      `failed to load config\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }

  logger.info('restored config');
};

export const saveConfig = async (): Promise<void> => {
  try {
    if (environment.PERSISTENCE_TYPE === PersistenceType.FILESYSTEM) {
      if (!configFilePath) return;

      const storeConfig = JSON.stringify(
        Object.fromEntries(
          config
            .entries()
            .map(
              ([topicId, [topicPath, contentType, persistence, expiration]]) =>
                [
                  topicId,
                  [topicPath, contentType, persistence, expiration ?? 0],
                ] as const,
            ),
        ),
        undefined,
        2,
      );

      await writeFile(configFilePath, `${storeConfig}\n`, { encoding: 'utf8' });
    }
  } catch (error) {
    logger.error(error);

    throw new Error(
      `failed to save config\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }

  logger.info('saved config');
};
