import { Router } from 'websocket-express';

import { makeLogger } from '../../logging.js';
import { PATH } from '../utils.js';
import { delete_ } from './delete.js';
import { get } from './get.js';
import { head } from './head.js';
import { patch } from './patch.js';
import { post } from './post.js';
import { put } from './put.js';
import { ws } from './ws.js';

const _logger = makeLogger(import.meta.filename);

export const router = new Router({ mergeParams: true });

router.delete(PATH, delete_);
router.get(PATH, get);
router.head(PATH, head);
router.patch(PATH, patch);
router.post(PATH, post);
router.put(PATH, put);
router.ws(PATH, ws);
