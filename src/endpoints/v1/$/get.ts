/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';

import { getConsumerTopic } from '../../../controllers/consumer/main.js';
import { findConsumerByPath } from '../../../controllers/consumer/state.js';
import { makeLogger } from '../../../logging.js';
import { ParamsWildcard } from '../../utils.js';
import { serializeConsumer, serializeTopic } from './utils.js';

const logger = makeLogger(import.meta.filename);

export const get = Router({ mergeParams: true });

const validation = validate({
  params: ParamsWildcard,
});

get.use(validation, async (request, response) => {
  const { params } = request;

  logger.info({ params });

  const consumer = findConsumerByPath(params.path);
  const topic = getConsumerTopic(params.path);

  logger.info({ consumer });
  logger.info({ topic });

  response.json({
    consumer: serializeConsumer(consumer),
    topic: serializeTopic(topic),
  });
  response.end();
});
