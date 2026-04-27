import { Readable } from 'node:stream';

import validate from 'express-zod-safe';
import { Router } from 'websocket-express';
import z from 'zod';

import { getConsumerPayload } from '../../controllers/matcher/main.js';
import { GetPayloadType } from '../../controllers/topic/topic.js';
import { environment } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { makeHeaders, ParamsWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const ws = new Router({ mergeParams: true });

const Query = z.object({
  opportunistic: environment.ALLOW_OPPORTUNISTIC_CONNECTIONS
    ? z.stringbool().default(false)
    : z.never(
        String.raw`'ALLOW_OPPORTUNISTIC_CONNECTIONS' is false, cannot use opportunistic`,
      ),
  type: environment.ALLOW_OPPORTUNISTIC_CONNECTIONS
    ? z.enum(GetPayloadType).default(GetPayloadType.ALL)
    : z.never(
        String.raw`'ALLOW_OPPORTUNISTIC_CONNECTIONS' is false, cannot use ignoreCurrent`,
      ),
});

const validation = validate({
  params: ParamsWildcard,
  query: Query,
});

ws.use(validation, async ({ params, query }, response, next) => {
  logger.info({ params, query });

  const [topic, payload] = await getConsumerPayload(
    params.path,
    query.opportunistic,
    query.type,
  );

  logger.info({ topic });

  response.set(makeHeaders(topic));

  if (payload instanceof Readable) {
    payload.pipe(response);
  } else {
    response.end(payload);
  }

  return next();
});
