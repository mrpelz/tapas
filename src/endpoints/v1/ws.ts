import { arrayBuffer } from 'node:stream/consumers';

import { emptyBuffer } from '@mrpelz/misc-utils/data';
import validate from 'express-zod-safe';
import { isWebSocket, Router } from 'websocket-express';
import z from 'zod';

import { streamConsumerPayloads } from '../../controllers/matcher/main.js';
import { GetPayloadType } from '../../controllers/topic/topic.js';
import { environment } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { ParamsWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export const ws = new Router({ mergeParams: true });

const Query = z.object({
  opportunistic: environment.ALLOW_OPPORTUNISTIC_CONNECTIONS
    ? z.stringbool().default(false)
    : z.never(
        String.raw`'ALLOW_OPPORTUNISTIC_CONNECTIONS' is false, cannot use opportunistic`,
      ),
  type: z
    .enum(GetPayloadType)
    .refine(
      (value) => value !== GetPayloadType.PERSISTED,
      `cannot use 'type=${GetPayloadType.PERSISTED}' with websockets`,
    )
    .default(GetPayloadType.ALL),
});

const validation = validate({
  params: ParamsWildcard,
  query: Query,
});

ws.use(validation, async (request, response, next) => {
  if (!isWebSocket(response)) {
    return next();
  }

  const { params, query } = request;

  logger.info({ params, query }, 'websocket');

  const abort = new AbortController();
  request.addListener('aborted', () => abort.abort());

  const state = streamConsumerPayloads(
    params.path,
    query.opportunistic,
    query.type,
    abort,
  );

  const websocket = await response.accept();
  websocket.addEventListener('close', () => abort.abort());

  const observer = state.observe(async ([topic, payload]) => {
    if (websocket.readyState !== websocket.OPEN) return;

    logger.info({ topic });

    websocket.send(payload ? await arrayBuffer(payload) : emptyBuffer);
  });

  abort.signal.addEventListener('abort', () => observer.remove());

  return next();
});
