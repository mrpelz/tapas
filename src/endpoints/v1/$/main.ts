/* eslint-disable new-cap */
import { Router } from 'express';

import { PATH } from '../../utils.js';

export const router = Router({ mergeParams: true });

router.all(PATH, (_request, response) => response.end('$'));
