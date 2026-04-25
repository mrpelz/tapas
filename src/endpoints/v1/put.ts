/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';

import { setTopicPayload } from '../../controllers/topic/main.js';
import { makeLogger } from '../../logging.js';
import { makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const put = Router({ mergeParams: true });

const validation = validate({
  params: ParamsNonWildcard,
});

put.use(validation, async (request, response, next) => {
  const { readableLength, params, query } = request;

  logger.info({ params, query });

  const topic = await setTopicPayload(
    params.path,
    readableLength ? request : undefined,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 201;
  response.end();

  return next();
});
