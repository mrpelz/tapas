/* eslint-disable new-cap */
import { Router } from 'express';

import { makeLogger } from '../../logging.js';
import { PATH } from '../utils.js';
import { post } from './post.js';

const _logger = makeLogger(import.meta.filename);

export const router = Router({ mergeParams: true });

router.post(PATH, post);
