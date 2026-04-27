/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';
import z from 'zod';

import { modifyTopic } from '../../controllers/topic/main.js';
import { Expiration } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const patch = Router({ mergeParams: true });

const Query = z.object({
  expire: Expiration.optional(),
  persist: z.stringbool().optional(),
});

const validation = validate({
  params: ParamsNonWildcard,
  query: Query,
});

patch.use(validation, async (request, response, next) => {
  const { readableLength, params, query } = request;

  logger.info({ params, query });

  const topic = await modifyTopic(
    params.path,
    query.persist,
    query.expire,
    readableLength ? request : undefined,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 201;
  response.end();

  return next();
});
