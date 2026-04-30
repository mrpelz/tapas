import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { ZodObject, ZodType } from 'zod';

export const registry = new OpenAPIRegistry();

export const replaceInObject = <T extends ZodObject>(
  object: T,
  key: keyof T['def']['shape'],
  schema: ZodType,
): T => {
  Object.assign(object.def.shape, { [key]: schema });

  return object;
};
