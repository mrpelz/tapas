/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';
import z from 'zod';

import { getConsumerPayload } from '../../controllers/consumer/main.js';
import { GetPayloadType } from '../../controllers/topic/topic.js';
import { environment } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { makeHeaders, ParamsWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const head = Router({ mergeParams: true });

const Query = z.object({
  opportunistic: environment.ALLOW_OPPORTUNISTIC_CONNECTIONS
    ? z.stringbool().default(false)
    : z.never(
        String.raw`'ALLOW_OPPORTUNISTIC_CONNECTIONS' is false, cannot use opportunistic`,
      ),
  type: environment.ALLOW_OPPORTUNISTIC_CONNECTIONS
    ? z.enum(GetPayloadType).default(GetPayloadType.ALL)
    : z
        .literal(
          GetPayloadType.ALL,
          String.raw`'ALLOW_OPPORTUNISTIC_CONNECTIONS' is false, type must be 'all'`,
        )
        .default(GetPayloadType.ALL),
});

const validation = validate({
  params: ParamsWildcard,
  query: Query,
});

head.use(validation, async (request, response, next) => {
  const { params, query } = request;

  logger.info({ params, query });

  const abort = new AbortController();
  request.addListener('aborted', () => abort.abort());

  const [topic] = await getConsumerPayload(
    params.path,
    query.opportunistic,
    query.type,
    abort,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.end();

  return next();
});
