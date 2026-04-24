/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';

import { getTopicPayload } from '../../controllers/main.js';
import { makeLogger } from '../../logging.js';
import { makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const get = Router({ mergeParams: true });

const validation = validate({
  params: ParamsNonWildcard,
});

get.use(validation, async ({ params }, response, next) => {
  logger.info({ params });

  const [topic, payload] = await getTopicPayload(params.path);

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = payload?.length ? 200 : 204;
  response.end(payload);

  return next();
});
