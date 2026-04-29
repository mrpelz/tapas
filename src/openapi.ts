import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { makeLogger } from './logging.js';

const _logger = makeLogger(import.meta.filename);

export const registry = new OpenAPIRegistry();
