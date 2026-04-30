import {
  extendZodWithOpenApi,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { OpenAPIObjectConfig } from '@asteasolutions/zod-to-openapi/dist/v3.0/openapi-generator.js';
import z from 'zod';

import { makeLogger } from '../logging.js';

const logger = makeLogger(import.meta.filename);

extendZodWithOpenApi(z);

const { registry } = await import('./main.js');

const generator = new OpenApiGeneratorV3(registry.definitions, {
  sortComponents: 'alphabetically',
  unionPreferredType: 'oneOf',
});

const documentConfig: OpenAPIObjectConfig = {
  info: { title: 'tapas v1 api', version: '1.0.0' },
  openapi: '3.0.0',
  servers: [{ url: '/v1' }],
};

logger.info(generator.generateDocument(documentConfig), 'openapi v1 schema');
