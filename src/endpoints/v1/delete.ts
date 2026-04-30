/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';

import { removeTopic } from '../../controllers/topic/main.js';
import { environment } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { MethodNotAllowedError } from '../error.js';
import { makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const delete_ = Router({ mergeParams: true });

const validation = validate({
  params: ParamsNonWildcard,
});

delete_.use(validation, async ({ params }, response, next) => {
  logger.info({ params });

  if (!environment.ALLOW_DYNAMIC_TOPICS) {
    throw new MethodNotAllowedError(
      String.raw`'ALLOW_DYNAMIC_TOPICS' is false, cannot delete topic`,
    );
  }

  const topic = await removeTopic(params.path);

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 204;
  response.end();

  return next();
});
