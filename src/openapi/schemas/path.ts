import { ConsumerPath as ConsumerPath_ } from '../../controllers/consumer/consumer.js';
import { TopicPath as TopicPath_ } from '../../controllers/topic/topic.js';
import { ParamsNonWildcard, ParamsWildcard } from '../../endpoints/utils.js';
import { registry, replaceInObject } from '../registry.js';

export const TopicPath = registry.registerParameter(
  'TopicPath',
  TopicPath_.openapi({
    description: String.raw`non-wildcard path, i.e. no '*' or '+' path items`,
    param: {
      in: 'path',
      name: 'path',
    },
  }),
);
replaceInObject(ParamsNonWildcard, 'path', TopicPath);

export const ConsumerPath = registry.registerParameter(
  'ConsumerPath',
  ConsumerPath_.openapi({
    description: String.raw`wildcard path: '*' at the end of the path matches all more specific topic paths, '+' matches with all topic path items in the same position`,
    param: {
      in: 'path',
      name: 'path',
    },
  }),
);
replaceInObject(ParamsWildcard, 'path', ConsumerPath);
