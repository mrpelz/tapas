/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';
import z from 'zod';

import { addTopic } from '../../controllers/topic/main.js';
import {
  ContentType,
  environment,
  Expiration,
  PersistenceType,
} from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { MethodNotAllowedError } from '../error.js';
import { getBodyReadable, makeHeaders, ParamsNonWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const post = Router({ mergeParams: true });

const Query = z.object({
  contentType: ContentType.default(environment.FALLBACK_CONTENT_TYPE),
  expire:
    /* eslint-disable prettier/prettier */
    // eslint-disable-next-line no-nested-ternary
    environment.PERSISTENCE_TYPE === PersistenceType.NONE
      ? z.never(
          `'expire' cannot be used if PERSISTENCE_TYPE is '${PersistenceType.NONE}'`,
        )
      : (environment.FALLBACK_EXPIRATION === undefined
        ? Expiration
        : Expiration.default(environment.FALLBACK_EXPIRATION)),
    /* eslint-enable prettier/prettier */
  persist:
    environment.PERSISTENCE_TYPE === PersistenceType.NONE
      ? z.never(
          `'persist' cannot be used if PERSISTENCE_TYPE is '${PersistenceType.NONE}'`,
        )
      : z.stringbool().default(false),
});

const validation = validate({
  params: ParamsNonWildcard,
  query: Query,
});

post.use(validation, async (request, response, next) => {
  const { params, query } = request;

  logger.info({ params, query });

  if (!environment.ALLOW_DYNAMIC_TOPICS) {
    throw new MethodNotAllowedError(
      String.raw`'ALLOW_DYNAMIC_TOPICS' is false, cannot post topic`,
    );
  }

  const topic = await addTopic(
    params.path,
    query.contentType,
    undefined,
    query.persist,
    query.expire,
    undefined,
    getBodyReadable(request),
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = 201;
  response.end();

  return next();
});
