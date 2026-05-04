/* eslint-disable @typescript-eslint/naming-convention */
import { Request } from 'express';
import z from 'zod';

import { ConsumerPath } from '../controllers/consumer/consumer.js';
import {
  ReadableStreamWithLength,
  type Topic,
  TopicPath,
} from '../controllers/topic/topic.js';
import { environment } from '../environment.js';
import { makeLogger } from '../logging.js';
import {
  InternalServerError,
  LengthRequiredError,
  PayloadTooLargeError,
} from './error.js';

const _logger = makeLogger(import.meta.filename);

export const ParamsNonWildcard = z.object({
  path: TopicPath,
});

export const ParamsWildcard = z.object({
  path: ConsumerPath,
});

export const PATH = '/{*path}';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getBodyReadable = <T extends Request<any, any, any, any, any>>(
  request: T,
): ReadableStreamWithLength | undefined => {
  const contentLength = request.get('content-length');

  if (!request.readableLength || !contentLength) return undefined;
  if (request.readableLength && !contentLength) {
    throw new LengthRequiredError();
  }

  const length = Number.parseInt(contentLength, 10);
  if (!length) return undefined;

  if (environment.UPLOAD_SIZE_LIMIT && length > environment.UPLOAD_SIZE_LIMIT) {
    throw new PayloadTooLargeError(
      `${length} is over set limit of ${environment.UPLOAD_SIZE_LIMIT} bytes`,
    );
  }

  return {
    length,
    stream: request,
  };
};

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
    throw new InternalServerError(
      `failed to make headers\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
};
