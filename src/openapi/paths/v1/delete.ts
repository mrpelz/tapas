/* eslint-disable @typescript-eslint/naming-convention */

import { ParamsNonWildcard, PATH } from '../../../endpoints/utils.js';
import { registry } from '../../registry.js';
import { errorResponses } from '../../schemas/error.js';

registry.registerPath({
  description: 'delete a topic by path',
  method: 'delete',
  path: PATH,
  request: {
    params: ParamsNonWildcard,
  },
  responses: {
    ...errorResponses,
    204: {
      description: 'deleted',
    },
  },
  summary: 'delete a topic',
});
