/* eslint-disable @typescript-eslint/naming-convention */
import { RouteConfig } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import { registry } from '../registry.js';

const ErrorBody = registry.register(
  'ErrorBody',
  z.strictObject({
    code: z.int().positive().openapi({ description: 'http error code' }),
    data: z.object().openapi({ description: 'data from error object' }),
    errorChain: z
      .array(z.string())
      .openapi({ description: 'error messages from throw chain' }),
    head: z.string().openapi({ description: 'friendly error type name' }),
    message: z.string().openapi({ description: 'error message' }),
    name: z.string().openapi({ description: 'error type name' }),
  }),
);

export const errorResponses: RouteConfig['responses'] = {
  400: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'bad request error body',
  },
  404: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'not found error body',
  },
  405: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'method not allowed error body',
  },
  409: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'conflict error body',
  },
  500: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'internal server error body',
  },
};
