import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdtempDisposable, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { arrayBuffer } from 'node:stream/consumers';

import z from 'zod';

import { safeAsync } from '../../async.js';
import { environment, Expiration, PersistenceType } from '../../environment.js';
import { makeLogger } from '../../logging.js';
import { TopicId } from '../topic/topic.js';
import { Persistence } from './main.js';

const logger = makeLogger(import.meta.filename);

export let tmpCleanup: (() => Promise<void>) | undefined;
export const directory = await (async () => {
  try {
    const { PERSISTENCE_TYPE } = environment;
    if (PERSISTENCE_TYPE !== PersistenceType.FILESYSTEM) return undefined;

    const { FILESYSTEM_PATH } = environment;
    if (FILESYSTEM_PATH === undefined) {
      const [error, tmp] = await safeAsync(
        mkdtempDisposable(path.join(process.cwd(), 'tapas_')),
      );
      if (error) throw error;

      tmpCleanup = () => tmp.remove();

      return tmp.path;
    }

    const dir = path.resolve(process.cwd(), FILESYSTEM_PATH);
    const exists = existsSync(dir);
    if (!exists) {
      throw new Error(`path '${dir}' does not exist`);
    }

    const [error, stats] = await safeAsync(stat(dir));
    if (error) throw error;

    if (!stats.isDirectory()) {
      throw new Error(`path '${dir}' is not a directory`);
    }

    return dir;
  } catch (error) {
    throw new Error(
      `failed to setup filesystem directory\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
})();

if (directory) {
  logger.info(`using directory '${directory}'`);
}

export class PersistenceFilesystem extends Persistence {
  private readonly _filePath: string;

  constructor(
    topicId: z.infer<typeof TopicId>,
    expiration: z.infer<typeof Expiration>,
  ) {
    super(expiration);

    try {
      if (!directory) {
        throw new Error('no filesystem directory available');
      }

      this._filePath = path.join(directory, topicId);
    } catch (error) {
      throw new Error(
        `failed to initialize PersistenceFilesystem\n  ${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    }

    this._getLastModified();

    logger.info(
      { filePath: this._filePath },
      `constructed PersistenceFilesystem with file path '${this._filePath}'`,
    );
  }

  get stream(): ReadableStream | undefined {
    if (!existsSync(this._filePath)) return undefined;

    return Readable.toWeb(createReadStream(this._filePath));
  }

  private async _getLastModified() {
    if (!existsSync(this._filePath)) return;

    const fileStats = await stat(this._filePath);
    this._lastModified.value = fileStats.mtime;
  }

  async remove(): Promise<void> {
    await unlink(this._filePath);
    await this._getLastModified();
  }

  async set(value: ReadableStream | undefined): Promise<void> {
    if (value) {
      const stream = createWriteStream(this._filePath);
      Readable.fromWeb(value).pipe(stream);

      await arrayBuffer(value);
    } else {
      await unlink(this._filePath);
    }

    await this._getLastModified();
  }
}
