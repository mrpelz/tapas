/* eslint-disable new-cap */
import { Router } from 'express';
import validate from 'express-zod-safe';
import z from 'zod';

import { getConsumerPayload } from '../../controllers/matcher/main.js';
import { environment } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { makeHeaders, ParamsWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const get = Router({ mergeParams: true });

const Query = z.object({
  opportunistic: environment.ALLOW_OPPORTUNISTIC_CONNECTIONS
    ? z.stringbool().default(false)
    : z.never(
        String.raw`'ALLOW_OPPORTUNISTIC_CONNECTIONS' is false, cannot use opportunistic connection`,
      ),
});

const validation = validate({
  params: ParamsWildcard,
  query: Query,
});

get.use(validation, async ({ params, query }, response, next) => {
  logger.info({ params, query });

  const [topic, payload] = await getConsumerPayload(
    params.path,
    query.opportunistic,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));
  response.statusCode = payload?.length ? 200 : 204;
  response.end(payload);

  return next();
});
