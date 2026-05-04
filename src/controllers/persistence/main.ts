import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import {
  Observable,
  ProxyObservable,
  ReadOnlyObservable,
} from '@mrpelz/observable';
import z from 'zod';

import { environment, Expiration, PersistenceType } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { createReadableFromValue } from '../../utils.js';
import { ReadableStreamWithLength } from '../topic/topic.js';
import { type PersistenceFilesystem } from './filesystem.js';
import { PersistenceS3 } from './s3.js';

const logger = makeLogger(import.meta.filename);

export class Persistence {
  protected readonly _expiresAt = new Observable<Date | undefined>(undefined);
  protected readonly _lastModified = new Observable<Date | undefined>(
    undefined,
  );

  readonly expiration = new Observable<z.infer<typeof Expiration>>(undefined);
  readonly expiresAt = new ReadOnlyObservable(this._expiresAt);
  readonly lastModified = new ReadOnlyObservable(this._lastModified);

  constructor(expiration: z.infer<typeof Expiration>) {
    try {
      if (environment.PERSISTENCE_TYPE === PersistenceType.NONE) {
        throw new Error(
          `Persistence cannot be used if PERSISTENCE_TYPE is '${PersistenceType.NONE}'`,
        );
      }
    } catch (error) {
      throw new Error(
        `failed to construct Persistence\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }

    this.expiration.value = expiration;

    this._expiresAt.value = this._getExpiration();
    this.expiration.observe(
      () => (this._expiresAt.value = this._getExpiration()),
    );
    this._lastModified.observe(
      () => (this._expiresAt.value = this._getExpiration()),
    );

    logger.info('constructed Persistence');
  }

  private _getExpiration() {
    if (!this.expiration.value) return undefined;
    if (!this._lastModified.value) return undefined;

    const result = new Date();
    result.setTime(this._lastModified.value.getTime() + this.expiration.value);

    return result;
  }
}

export class PersistenceMemory extends Persistence {
  private static _proxyGet(input: Buffer | undefined) {
    return input;
  }

  private readonly _payload = new Observable<Buffer | undefined>(undefined);
  // eslint-disable-next-line @typescript-eslint/member-ordering
  private _deduplicatedPayload = new ProxyObservable(
    this._payload,
    PersistenceMemory._proxyGet,
    (input) => {
      if (input === this._payload.value) return ProxyObservable.doNotSet;
      if (
        this._payload.value &&
        input &&
        input.compare(this._payload.value) === 0
      ) {
        return ProxyObservable.doNotSet;
      }

      return input;
    },
  );

  constructor(expiration: z.infer<typeof Expiration>) {
    super(expiration);
    this._deduplicatedPayload.observe(
      () => (this._lastModified.value = new Date()),
    );

    logger.info('constructed PersistenceMemory');
  }

  get stream(): Promise<ReadableStreamWithLength | undefined> {
    return (async () => {
      if (!this._deduplicatedPayload.value) return undefined;

      const stream = createReadableFromValue(this._deduplicatedPayload.value);

      return {
        length: this._deduplicatedPayload.value.length,
        stream,
      };
    })();
  }

  async set(value: Readable | undefined): Promise<void> {
    this._deduplicatedPayload.value = value ? await buffer(value) : undefined;
  }
}

export type TPersistence =
  | PersistenceMemory
  | PersistenceFilesystem
  | PersistenceS3;
