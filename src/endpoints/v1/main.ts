/* eslint-disable new-cap */
import { Router } from 'express';

import { makeLogger } from '../../logging.js';
import { PATH } from '../utils.js';
import { delete_ } from './delete.js';
import { get } from './get.js';
import { head } from './head.js';
import { patch } from './patch.js';
import { post } from './post.js';
import { put } from './put.js';

const _logger = makeLogger(import.meta.filename);

export const router = Router({ mergeParams: true });

router.head(PATH, head);
router.post(PATH, post);
router.patch(PATH, patch);
router.put(PATH, put);
router.get(PATH, get);
router.delete(PATH, delete_);
