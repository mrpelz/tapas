import { emptyBuffer } from '@mrpelz/misc-utils/data';
import validate from 'express-zod-safe';
import { isWebSocket, Router } from 'websocket-express';
import z from 'zod';

import {
  getConsumerTopic,
  streamConsumerPayloads,
} from '../../controllers/consumer/main.js';
import { GetPayloadType } from '../../controllers/topic/topic.js';
import { environment } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import {
  awaitEnd,
  createReadableFromValue,
  piggybackReadable,
  safeAsync,
  websocketDataLength,
} from '../../utils.js';
import { ParamsWildcard } from '../utils.js';

const logger = makeLogger(import.meta.filename);

export enum WebSocketDirection {
  BOTH = 'both',
  EMIT = 'emit',
  INGEST = 'ingest',
}

export const ws = new Router({ mergeParams: true });

const Query = z.object({
  direction: z.enum(WebSocketDirection).default(WebSocketDirection.BOTH),
  echo: z.stringbool().default(false),
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

  let isEmitting = false;

  const abort = new AbortController();
  request.addListener('aborted', () => abort.abort());

  const emitState =
    query.direction === WebSocketDirection.INGEST
      ? undefined
      : streamConsumerPayloads(
          params.path,
          query.opportunistic,
          query.type,
          abort,
        );

  const ingestTopic =
    query.direction === WebSocketDirection.EMIT
      ? undefined
      : getConsumerTopic(params.path);

  const websocket = await response.accept();
  websocket.addEventListener('close', () => abort.abort());

  const observer = emitState?.observe(async ([, { length, stream } = {}]) => {
    if (websocket.readyState !== websocket.OPEN) return;

    // do not re-emit messages sent by same connection
    if (!query.echo && isEmitting) return;
    if (length === 0) return;

    if (stream) {
      const tee = piggybackReadable(stream);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onData = (chunk: any) => websocket.send(chunk, { fin: false });
      tee.on('data', onData);
      tee.once('end', () => tee.off('data', onData));

      await awaitEnd(tee);
    }

    websocket.send(emptyBuffer, { fin: true });

    logger.info(
      {
        path: params.path,
      },
      `emitted message for websocket '${params.path.join('.')}'`,
    );
  });

  if (ingestTopic) {
    logger.info({ topic: ingestTopic });

    websocket.addEventListener('message', async ({ data }) => {
      const length = websocketDataLength(data);
      const stream = createReadableFromValue(data);

      isEmitting = true;
      const write = length > 0 ? { length, stream } : undefined;

      const [error] = await safeAsync(ingestTopic.setPayload(write));
      if (error) logger.error(error);

      isEmitting = false;

      await write;

      logger.info(
        {
          path: params.path,
        },
        `ingested message for websocket '${params.path.join('.')}'`,
      );
    });
  }

  abort.signal.addEventListener('abort', () => {
    observer?.remove();

    logger.info(
      {
        path: params.path,
      },
      `aborted websocket request '${params.path.join('.')}'`,
    );
  });

  return next();
});
