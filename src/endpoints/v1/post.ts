/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';
import z from 'zod';

import { ContentType, environment } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { addTopic } from '../../logic/main.js';
import { Expiration } from '../../logic/persistence/main.js';
import { MethodNotAllowedError } from '../error.js';
import { Body, makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const post = Router({ mergeParams: true });

const Query = z.object({
  contentType: ContentType.default(environment.FALLBACK_CONTENT_TYPE),
  expire: Expiration,
  persist: z.coerce.boolean().default(false),
});

const validation = validate({
  body: Body,
  params: ParamsNonWildcard,
  query: Query,
});

post.use(validation, async ({ body, params, query }, response, next) => {
  logger.info({ params });
  logger.info({ query });
  logger.info({ body });

  if (!environment.ALLOW_DYNAMIC_TOPICS) {
    throw new MethodNotAllowedError(
      String.raw`'ALLOW_DYNAMIC_TOPICS' is false, cannot post topic`,
    );
  }

  const topic = await addTopic(
    params.path,
    query.contentType,
    undefined,
    query.persist,
    query.expire,
    body,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 201;
  response.end();

  return next();
});
