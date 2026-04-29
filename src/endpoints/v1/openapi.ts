import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';

import { makeLogger } from '../../logging.js';
import { registry as registryParent } from '../../openapi.js';

const logger = makeLogger(import.meta.filename);

export const registry = new OpenAPIRegistry([registryParent]);

export const logOpenAPISpec = (): void => {
  logger.info(
    new OpenApiGeneratorV3(registry.definitions, {
      sortComponents: 'alphabetically',
      unionPreferredType: 'oneOf',
    }).generateDocument({
      info: { title: 'tapas v1 api', version: '1.0.0' },
      openapi: '3.0.0',
      servers: [{ url: '/v1' }],
    }),
    'openapi v1 schema',
  );
};
