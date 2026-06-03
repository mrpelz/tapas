/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';

import { removeTopic } from '../../controllers/topic/main.js';
import { makeLogger } from '../../logging.js';
import { makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const delete_ = Router({ mergeParams: true });

const validation = validate({
  params: ParamsNonWildcard,
});

delete_.use(validation, async ({ params }, response, next) => {
  logger.info({ params });

  const topic = await removeTopic(params.path);

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 204;
  response.end();

  return next();
});
