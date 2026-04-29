import { Server } from 'node:http';

import { setGlobalOptions } from 'express-zod-safe';
import { pinoHttp } from 'pino-http';
import { WebSocketExpress } from 'websocket-express';

import { matchConsumerToTopic } from './controllers/consumer/state.js';
import { tmpCleanup } from './controllers/persistence/filesystem.js';
import {
  loadTopicsFile,
  restoreState,
  saveSate,
} from './controllers/topic/state.js';
import { appErrorHandler, validationErrorHandler } from './endpoints/error.js';
import { router as v1Router } from './endpoints/v1/main.js';
import { logOpenAPISpec } from './endpoints/v1/openapi.js';
import { environment } from './environment.js';
import { makeLogger } from './logging.js';

const logger = makeLogger(import.meta.filename);

const expressApp = new WebSocketExpress();

expressApp.useHTTP(pinoHttp({ logger }));

setGlobalOptions({
  handler: validationErrorHandler,
});

expressApp.use('/v1', v1Router);

expressApp.useHTTP('/v1', appErrorHandler);

let server: Server | undefined;

export const app = async (): Promise<void> => {
  await loadTopicsFile();
  await restoreState();

  matchConsumerToTopic.trigger();

  server = expressApp.listen(environment.PORT, () =>
    logger.info(`server running on port ${environment.PORT}`),
  );

  if (environment.CONNECTION_TIMEOUT) {
    logger.info(
      `setting server connection timeout to ${environment.CONNECTION_TIMEOUT} ms`,
    );

    server.setTimeout(environment.CONNECTION_TIMEOUT);
  }

  logger.info('started');

  logOpenAPISpec();
};

export const cleanup = async (): Promise<void> => {
  logger.info('cleanup');

  server?.close();

  await saveSate();
  await tmpCleanup?.();
};
