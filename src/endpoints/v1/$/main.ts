import { Router } from 'websocket-express';

import { makeLogger } from '../../../logging.js';
import { PATH } from '../../utils.js';
import { get } from './get.js';

const _logger = makeLogger(import.meta.filename);

export const router = new Router({ mergeParams: true });

router.get(PATH, get);
