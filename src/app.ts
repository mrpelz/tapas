import express from 'express';
import { setGlobalOptions } from 'express-zod-safe';
import { pinoHttp } from 'pino-http';

import { appErrorHandler, validationErrorHandler } from './endpoints/error.js';
import { router as v1$Router } from './endpoints/v1/$/main.js';
import { router as v1Router } from './endpoints/v1/main.js';
import { environment } from './environment.js';
import { makeLogger } from './logging.js';
import { tmpCleanup } from './logic/persistence/filesystem.js';
import { restoreConfig, saveConfig } from './logic/state.js';

const logger = makeLogger(import.meta.filename);

const expressApp = express();

expressApp.use(pinoHttp({ logger }));
expressApp.use(express.raw({ type: '*/*' }));

setGlobalOptions({
  handler: validationErrorHandler,
});

expressApp.use('/v1/$', v1$Router);
expressApp.use('/v1', v1Router);

expressApp.use('/v1', appErrorHandler);

export const app = async (): Promise<void> => {
  await restoreConfig();

  expressApp.listen(environment.PORT, () =>
    logger.info(`server running on port ${environment.PORT}`),
  );

  logger.info('started');
};

export const cleanup = async (): Promise<void> => {
  logger.info('cleanup');

  await saveConfig();
  await tmpCleanup?.();
};
