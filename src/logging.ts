import path from 'node:path';

import pino, { type Logger } from 'pino';

import { environment } from './environment.js';

const cwd = process.cwd();

const root = pino({
  transport:
    (environment.STDOUT_PRETTIFY ?? process.stdout.isTTY) ||
    environment.STDOUT_PRETTIFY
      ? { target: 'pino-pretty' }
      : undefined,
});

export const makeLogger = (modulePath: string): Logger => {
  const module = path.relative(cwd, modulePath);

  return root.child({ module });
};
