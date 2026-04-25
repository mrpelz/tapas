/* eslint-disable @typescript-eslint/naming-convention */
import z from 'zod';

import { type Topic, TopicPath } from '../controllers/topic/topic.js';
import { makeLogger } from '../logging.js';
import { InternalServerError } from './error.js';

const logger = makeLogger(import.meta.filename);

export const ParamsNonWildcard = z.object({
  path: TopicPath,
});

export const ParamsWildcard = z.object({
  path: z.array(z.string()).default([]),
});

export const Body = z
  .any()
  .transform((input) => (input instanceof Buffer ? input : undefined));

export const PATH = '/{*path}';

export const makeHeaders = (
  topic: Topic,
): Record<string, string | string[]> => {
  try {
    const {
      persistence: { value: persistence },
    } = topic;

    const result = {
      'content-type': topic.contentType,
      ...(persistence?.lastModified.value
        ? {
            'last-modified': persistence?.lastModified.value?.toString(),
          }
        : {}),
      ...(persistence?.expiresAt.value
        ? { 'x-tapas-expires-at': persistence?.expiresAt.value?.toString() }
        : {}),
      'x-tapas-settings': (() => {
        const params = new URLSearchParams();
        params.set('persist', JSON.stringify(Boolean(topic.persistence)));
        if (persistence?.expiration.value) {
          params.set('expire', JSON.stringify(persistence?.expiration.value));
        }

        return Array.from(
          params.entries().map(([key, value]) => `${key}=${value}`),
        );
      })(),
      'x-tapas-topic-id': topic.id,
      'x-tapas-topic-path': topic.path.join('.'),
    };

    return result;
  } catch (error) {
    logger.error(error);

    throw new InternalServerError(
      `failed to make headers\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
