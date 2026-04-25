/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';
import z from 'zod';

import { modifyTopic } from '../../controllers/topic/main.js';
import { environment, Expiration } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { MethodNotAllowedError } from '../error.js';
import { Body, makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const patch = Router({ mergeParams: true });

const Query = z.object({
  expire: Expiration.optional(),
  persist: z.stringbool().optional(),
});

const validation = validate({
  body: Body,
  params: ParamsNonWildcard,
  query: Query,
});

patch.use(validation, async ({ body, params, query }, response, next) => {
  logger.info({ body, params, query });

  if (!environment.ALLOW_DYNAMIC_TOPICS) {
    throw new MethodNotAllowedError(
      String.raw`'ALLOW_DYNAMIC_TOPICS' is false, cannot patch topic`,
    );
  }

  const topic = await modifyTopic(
    params.path,
    query.persist,
    query.expire,
    body?.length ? body : undefined,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 201;
  response.end();

  return next();
});
