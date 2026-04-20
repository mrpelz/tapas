import path from 'node:path';

import pino, { type Logger } from 'pino';

const cwd = process.cwd();

const root = pino({
  transport: process.stdout.isTTY ? { target: 'pino-pretty' } : undefined,
});

export const makeLogger = (modulePath: string): Logger => {
  const module = path.relative(cwd, modulePath);

  return root.child({ module });
};
