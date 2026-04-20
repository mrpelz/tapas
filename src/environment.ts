/* eslint-disable @typescript-eslint/naming-convention */
import z from 'zod';

import { makeLogger } from './logging.js';

const logger = makeLogger(import.meta.filename);

export enum PersistenceType {
  NONE = 'none',
  MEMORY = 'memory',
  FILESYSTEM = 'filesystem',
  S3 = 's3',
}

const PERSISTENCE_TYPE_DEFAULT = PersistenceType.FILESYSTEM;
export const TMP_PATH = 'tmp' as const;

export const ContentType = z
  .string()
  .regex(
    new RegExp(String.raw`^\w+/[-+.\w]+$`),
    String.raw`must be valid MIME type (e.g. 'application/json')`,
  );

const EnvironmentBase = z.object({
  ALLOW_DYNAMIC_TOPICS: z.coerce.boolean().default(true),
  ALLOW_OPPORTUNISTIC_CONNECTIONS: z.coerce.boolean().default(true),
  ALLOW_PING_PONG_CUSTOMIZATION: z.coerce.boolean().default(true),

  FALLBACK_CONTENT_TYPE: ContentType.default('application/octet-stream'),

  PERSISTENCE_TYPE: z.enum(PersistenceType),

  PING_PONG_INTERVAL: z.coerce.number().positive().int().default(5000),

  PORT: z.coerce.number().positive().int().default(3000),

  UPLOAD_SIZE_LIMIT: z.coerce.number().positive().int().default(0),
});

const EnvironmentPersistenceNone = EnvironmentBase.extend({
  PERSISTENCE_TYPE: z.literal(PersistenceType.NONE),
});

const EnvironmentPersistenceMemory = EnvironmentBase.extend({
  PERSISTENCE_TYPE: z.literal(PersistenceType.MEMORY),
});

const EnvironmentPersistenceFilesystem = EnvironmentBase.extend({
  PERSISTENCE_TYPE: z.literal(PersistenceType.FILESYSTEM),

  // eslint-disable-next-line sort-keys
  FILESYSTEM_PATH: z
    .union(
      [
        z.literal(TMP_PATH),
        z
          .string()
          .regex(
            new RegExp(String.raw`^\.?/?(?:\w/?)*$`),
            String.raw`must be valid path string (i.e. possibly starting with '/' or '.' and subsequent directories delimited with \'/\'`,
          ),
      ],
      String.raw`must be either 'tmp' or file path`,
    )
    .default('tmp'),
});

const EnvironmentPersistenceS3 = EnvironmentBase.extend({
  PERSISTENCE_TYPE: z.literal(PersistenceType.S3),

  S3_ACCESS_KEY: z.string().nonempty(),
  S3_BUCKET: z.string().nonempty(),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().nonempty(),
  S3_SECRET_KEY: z.string().nonempty(),
});

const Environment = z.discriminatedUnion(
  'PERSISTENCE_TYPE',
  [
    EnvironmentPersistenceNone,
    EnvironmentPersistenceMemory,
    EnvironmentPersistenceFilesystem,
    EnvironmentPersistenceS3,
  ],
  String.raw`PERSISTENCE_TYPE needs to be any of '${PersistenceType.NONE}', '${PersistenceType.MEMORY}', '${PersistenceType.FILESYSTEM}', '${PersistenceType.S3}'`,
);

export type TEnvironment = z.infer<typeof Environment>;

export const environment = (() => {
  try {
    return Environment.parse({
      PERSISTENCE_TYPE: PERSISTENCE_TYPE_DEFAULT,
      ...process.env,
    });
  } catch (error) {
    logger.error(error);

    throw new Error(
      `failed to load environment\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
})();

logger.info(environment, 'environment loaded');
