import { sleep } from '@mrpelz/misc-utils/sleep';

import { app, cleanup } from './app.js';
import { makeLogger } from './logging.js';

process.stdin.resume();

const logger = makeLogger(import.meta.filename);

const exit_ = (code: number) => {
  process.nextTick(() => {
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(code);
  });
};

let force = false;
const exit = async (code = 0) => {
  if (!force) {
    force = true;
    await cleanup();
  }

  process.removeListener('SIGINT', exit);
  process.removeListener('SIGTERM', exit);
  process.removeListener('SIGUSR1', exit);
  process.removeListener('SIGUSR2', exit);

  logger.info(`stopping process with exit code '${code}'`);

  exit_(code);
};

process.on('uncaughtException', async (cause) => {
  if (cause.message === 'aborted') return;

  const error = new Error(`uncaughtException\n  ${cause.message}`, { cause });

  logger.fatal(error);

  await sleep(5000);

  exit();
});

process.on('unhandledRejection', async (cause) => {
  if (!cause) return;
  if (!(cause instanceof Error)) return;
  if (cause.message === 'aborted') return;

  const error = new Error(
    `uncaughtRejection\n  ${cause instanceof Error ? cause.message : ''}`,
    { cause },
  );

  logger.fatal(error);

  await sleep(5000);

  exit();
});

const handleSignal = (signal: string) => {
  logger.info(`received signal '${signal}'`);

  exit();
};

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);
process.on('SIGUSR1', handleSignal);
process.on('SIGUSR2', handleSignal);

app();
