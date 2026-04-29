/* eslint-disable new-cap */
import { Readable } from 'node:stream';

import { Router } from 'express';
import validate from 'express-zod-safe';
import z from 'zod';

import { modifyTopic } from '../../controllers/topic/main.js';
import { environment, Expiration, PersistenceType } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const patch = Router({ mergeParams: true });

const Query = z.object({
  expire:
    environment.PERSISTENCE_TYPE === PersistenceType.NONE
      ? z.never(
          `'expire' cannot be used if PERSISTENCE_TYPE is '${PersistenceType.NONE}'`,
        )
      : Expiration.optional(),

  persist:
    environment.PERSISTENCE_TYPE === PersistenceType.NONE
      ? z.never(
          `'persist' cannot be used if PERSISTENCE_TYPE is '${PersistenceType.NONE}'`,
        )
      : z.stringbool().optional(),
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
    readableLength ? Readable.toWeb(request) : undefined,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 201;
  response.end();

  return next();
});
