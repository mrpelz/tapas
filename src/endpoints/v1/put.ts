/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';

import { setTopicPayload } from '../../controllers/topic/main.js';
import { makeLogger } from '../../logging.js';
import { Body, makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const put = Router({ mergeParams: true });

const validation = validate({
  body: Body,
  params: ParamsNonWildcard,
});

put.use(validation, async ({ body, params, query }, response, next) => {
  logger.info({ body, params, query });

  const topic = await setTopicPayload(
    params.path,
    body?.length ? body : undefined,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 201;
  response.end();

  return next();
});
