/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';
import z from 'zod';

import { setTopicPayload } from '../../controllers/topic/main.js';
import { makeLogger } from '../../logging.js';
import { getBodyReadable, makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const put = Router({ mergeParams: true });

const Query = z.object({
  wait: z.stringbool().optional(),
});

const validation = validate({
  params: ParamsNonWildcard,
  query: Query,
});

put.use(validation, async (request, response, next) => {
  const { params, query } = request;

  logger.info({ params, query });

  const topic = await setTopicPayload(
    params.path,
    getBodyReadable(request),
    query.wait,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 201;
  response.end();

  return next();
});
