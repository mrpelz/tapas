import { Readable } from 'node:stream';

import { WebSocket } from 'ws';

import { PayloadTooLargeError } from './endpoints/error.js';
import { makeLogger } from './logging.js';

const logger = makeLogger(import.meta.filename);

export const safeAsync = async <T>(
  promise: Promise<T> | T,
): Promise<[undefined, T] | [Error, undefined]> => {
  try {
    const result = await promise;
    return [undefined, result] as const;
  } catch (error) {
    if (error instanceof Error) {
      return [error, undefined] as const;
    }

    return [
      new Error('safeAsync encountered non-error value being thrown', {
        cause: error,
      }),
      undefined,
    ] as const;
  }
};

export const awaitEnd = (readable: Readable): Promise<void> => {
  logger.info('awaitEnd init');

  const { promise, resolve, reject } = Promise.withResolvers<void>();

  readable.once('end', () => {
    logger.info('awaitEnd end');
    resolve(undefined);
  });

  readable.once('error', (cause) => {
    logger.info('awaitEnd error');
    reject(cause);
  });

  return promise;
};

export const abortOnLengthExceeeded = (
  readable: Readable,
  length: number,
): void => {
  logger.info({ length }, 'abortOnLengthExceeeded init');

  let accumulatedLength = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onData = (chunk: any) => {
    logger.info('abortOnLengthExceeeded data');

    if (!(chunk instanceof Buffer)) return;

    accumulatedLength += chunk.length;

    if (accumulatedLength <= length) return;

    logger.info('abortOnLengthExceeeded exceed');

    readable.destroy(
      new PayloadTooLargeError(
        `ingested data exceeded set length of ${length}`,
      ),
    );
  };

  readable.on('data', onData);
  readable.once('close', () => {
    logger.info('abortOnLengthExceeeded close');

    readable.off('data', onData);
  });
};

export const piggybackReadable = (
  readable?: Readable,
): Readable | undefined => {
  if (!readable) return undefined;

  const tee = new Readable({
    read: (size) => readable.read(size),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onData = (chunk: any) => {
    logger.info('piggybackReadable data');

    return tee.push(chunk);
  };

  readable.on('data', onData);

  readable.once('end', () => {
    logger.info('piggybackReadable end');

    readable.off('data', onData);
    tee.push(null);
  });
  readable.once('close', () => {
    logger.info('piggybackReadable close');
    tee.destroy();
  });
  readable.once('error', (error) => {
    logger.info('piggybackReadable error');

    tee.destroy(error);
  });

  logger.info('piggybackReadable init');

  return tee;
};

export const websocketDataLength = (data: WebSocket.Data): number => {
  if (typeof data === 'string') return data.length;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (data instanceof Buffer) return data.length;
  if (Array.isArray(data)) {
    let result = 0;

    for (const item of data) {
      result += item.length;
    }

    return result;
  }

  return 0;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createReadableFromValue = (value: any): Readable => {
  const readable = new Readable({
    read: () => undefined,
  });

  setImmediate(() => {
    readable.push(value);
    // eslint-disable-next-line unicorn/prefer-single-call
    readable.push(null);
  });

  return readable;
};
