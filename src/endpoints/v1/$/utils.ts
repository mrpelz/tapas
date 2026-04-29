/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { Consumer } from '../../../controllers/consumer/consumer.js';
import { Topic } from '../../../controllers/topic/topic.js';
import { makeLogger } from '../../../logging.js';

const _logger = makeLogger(import.meta.filename);

export const serializeTopic = (topic?: Topic) =>
  topic
    ? {
        contentType: topic.contentType,
        id: topic.id,
        isReadOnly: topic.isReadOnly,
        path: topic.path,
      }
    : null;

export const serializeConsumer = (consumer?: Consumer) =>
  consumer
    ? {
        path: consumer.path,
        topics: consumer.topics.value.map((topic) => serializeTopic(topic)),
      }
    : null;
