/* eslint-disable @typescript-eslint/naming-convention */
import z from 'zod';

export enum PersistenceType {
  NONE = 'none',
  MEMORY = 'memory',
  FILESYSTEM = 'filesystem',
  S3 = 's3',
}

export enum ForwardStrategy {
  TEE = 'tee',
  STORE_AND_FORWARD = 'store-and-forward',
}

const PERSISTENCE_TYPE_DEFAULT = PersistenceType.FILESYSTEM;

export const ContentType = z
  .string()
  .regex(
    new RegExp(String.raw`^\w+/[-+.\w]+$`),
    String.raw`must be valid MIME type (e.g. 'application/json')`,
  );

export const Expiration = z.coerce.number().int().min(1).optional();

const EnvironmentBase = z.object({
  ALLOW_DYNAMIC_TOPICS: z.stringbool().default(true),
  ALLOW_EPHEMERAL_TOPICS: z.stringbool().default(true),
  ALLOW_OPPORTUNISTIC_CONNECTIONS: z.stringbool().default(true),
  ALLOW_PING_PONG_CUSTOMIZATION: z.stringbool().default(true),

  CONNECTION_TIMEOUT: z.coerce.number().positive().int().default(0),

  FALLBACK_CONTENT_TYPE: ContentType.default('application/octet-stream'),
  FALLBACK_EXPIRATION: Expiration,

  FORWARD_STRATEGY: z.enum(ForwardStrategy).default(ForwardStrategy.TEE),

  PING_PONG_INTERVAL: z.coerce.number().positive().int().default(5000),

  PORT: z.coerce.number().positive().int().default(3000),

  STDOUT_PRETTIFY: z.stringbool().optional(),

  TOPICS_FILE: z.string().optional(),

  UPLOAD_SIZE_LIMIT: z.coerce.number().optional(),
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
  FILESYSTEM_PATH: z.string().optional(),
});

const EnvironmentPersistenceS3 = EnvironmentBase.extend({
  PERSISTENCE_TYPE: z.literal(PersistenceType.S3),

  S3_ACCESS_KEY: z.string().nonempty().optional(),
  S3_BUCKET: z.string().nonempty().optional(),
  S3_ENDPOINT: z.url(),
  S3_PATHSTYLE: z.stringbool().optional(),
  S3_REGION: z.string().nonempty(),
  S3_SECRET_KEY: z.string().nonempty().optional(),
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
    throw new Error(
      `failed to load environment\n  ${error instanceof Error ? error.message : ''}`,
      { cause: error },
    );
  }
})();

(async () => {
  const { makeLogger } = await import('./logging.js');

  makeLogger(import.meta.filename).info(
    {
      ...environment,
      ...('S3_ACCESS_KEY' in environment && environment.S3_ACCESS_KEY
        ? { S3_ACCESS_KEY: '***' }
        : {}),
      ...('S3_SECRET_KEY' in environment && environment.S3_SECRET_KEY
        ? { S3_SECRET_KEY: '***' }
        : {}),
    },
    'environment loaded',
  );
})();
