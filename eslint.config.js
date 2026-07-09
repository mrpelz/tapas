import {
  config,
  configMeta,
  // @ts-ignore
} from '@mrpelz/boilerplate-node/eslint.config.js';

if (config.rules) {
  config.rules['unicorn/prefer-string-raw'] = 'off';
}

/** @type {import('eslint').Linter.Config[]} */
export default [configMeta, config];
