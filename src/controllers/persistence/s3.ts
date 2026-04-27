import { Readable } from 'node:stream';

import { S3Client } from '@bradenmacdonald/s3-lite-client';
import z from 'zod';

import { environment, Expiration, PersistenceType } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { TopicId } from '../topic/topic.js';
import { Persistence } from './main.js';

const logger = makeLogger(import.meta.filename);

export const s3client =
  environment.PERSISTENCE_TYPE === PersistenceType.S3
    ? new S3Client({
        accessKey: environment.S3_ACCESS_KEY,
        bucket: environment.S3_BUCKET,
        endPoint: environment.S3_ENDPOINT,
        pathStyle: environment.S3_PATHSTYLE,
        region: environment.S3_REGION,
        secretKey: environment.S3_SECRET_KEY,
      })
    : undefined;

export class PersistenceS3 extends Persistence {
  private readonly _s3Client: S3Client;

  constructor(
    private readonly _topicId: z.infer<typeof TopicId>,
    expiration: z.infer<typeof Expiration>,
  ) {
    super(expiration);

    try {
      if (!s3client) {
        throw new Error('no s3 client available');
      }

      this._s3Client = s3client;
    } catch (error) {
      throw new Error(
        `failed to initialize PersistenceS3\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }

    this._getLastModified();

    logger.info(
      { topicId: this._topicId },
      `constructed PersistenceFilesystem with topic ID '${this._topicId}'`,
    );
  }

  private async _getLastModified() {
    const { lastModified } =
      (await this._s3Client.statObject(this._topicId).catch(() => undefined)) ??
      {};

    this._lastModified.value = lastModified;
  }

  get stream(): Promise<Readable | undefined> {
    return (async () => {
      const exists = await this._s3Client.exists(this._topicId);
      if (!exists) return undefined;

      const object = await this._s3Client
        .getObject(this._topicId)
        .catch(() => undefined);

      if (!object) return undefined;

      return object.body ? Readable.fromWeb(object.body) : undefined;
    })();
  }

  async set(value: Readable | undefined): Promise<void> {
    await (value
      ? this._s3Client.putObject(this._topicId, Readable.toWeb(value))
      : this._s3Client.deleteObject(this._topicId));

    await this._getLastModified();
  }
}
