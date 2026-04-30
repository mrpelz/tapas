/* eslint-disable @typescript-eslint/naming-convention */

import z from 'zod';

import { ParamsWildcard, PATH } from '../../../endpoints/utils.js';
import { Query } from '../../../endpoints/v1/get.js';
import { registry, replaceInObject } from '../../registry.js';
import { errorResponses } from '../../schemas/error.js';

export const QueryOpportunistic = registry.registerParameter(
  'getQueryOpportunistic',
  Query.def.shape.opportunistic.openapi({
    param: {
      description:
        'if true and no topics match the given (possibly wildcard) path, keeps connection open until matching topics are available',
      in: 'query',
      name: 'opportunistic',
    },
  }),
);
replaceInObject(Query, 'opportunistic', QueryOpportunistic);

export const QueryType = registry.registerParameter(
  'getQueryType',
  Query.def.shape.type.openapi({
    param: {
      description:
        'use to request specific payload types, possibly keeping connection open to wait for future payload',
      in: 'query',
      name: 'type',
    },
  }),
);
replaceInObject(Query, 'type', QueryType);

registry.registerPath({
  description: 'get payload of topic or consumer by path',
  method: 'get',
  path: PATH,
  request: {
    params: ParamsWildcard,
    query: Query,
  },
  responses: {
    ...errorResponses,
    200: {
      content: {
        '*/*': {
          schema: z.unknown().openapi({
            description:
              'opaque data using content-type previously specified when creating topic',
          }),
        },
      },
      description:
        'payload of directly matched topic or topic matched from consumer payload',
    },
    204: {
      description:
        'directly topic or topic matched from consumer has empty payload',
    },
  },
  summary: 'get a topic or consumer payload',
});
