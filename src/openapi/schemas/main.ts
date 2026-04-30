import './error.js';
import './path.js';

import { TopicId as TopicId_ } from '../../controllers/topic/topic.js';
import { registry } from '../registry.js';

export const TopicId = registry.register('TopicID', TopicId_);
