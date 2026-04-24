/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';

import { getTopic } from '../../controllers/main.js';
import { makeLogger } from '../../logging.js';
import { makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const head = Router({ mergeParams: true });

const validation = validate({
  params: ParamsNonWildcard,
});

head.use(validation, async ({ params }, response, next) => {
  logger.info({ params });

  const topic = getTopic(params.path);

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 204;
  response.end();

  return next();
});
