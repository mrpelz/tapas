/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { ErrorRequestHandler } from 'express';
import { ErrorRequestHandler as ValidationErrorRequestHandler } from 'express-zod-safe';
import z from 'zod';

import { makeLogger } from '../logging.js';
import { registry } from '../openapi.js';

const logger = makeLogger(import.meta.filename);

export class AppError extends Error {
  readonly code: number = 500;
  readonly data: object = {};
  readonly head: string = 'Unspecified Error';
  readonly name: string = 'AppError';

  constructor(message?: string, options?: ErrorOptions, data?: object) {
    super(message, options);

    if (data) this.data = data;
  }
}

export class ClientError extends AppError {}

export class BadRequestError extends ClientError {
  readonly code = 400;
  readonly head = 'Bad Request';
  readonly name = 'BadRequestError';
}

export class NotFoundError extends ClientError {
  readonly code = 404;
  readonly head = 'Not Found';
  readonly name = 'NotFoundError';
}

export class MethodNotAllowedError extends ClientError {
  readonly code = 405;
  readonly head = 'Method Not Allowed';
  readonly name = 'MethodNotAllowedError';
}

export class ConflictError extends ClientError {
  readonly code = 409;
  readonly head = 'Conflict';
  readonly name = 'ConflictError';
}

export class ServerError extends AppError {}

export class InternalServerError extends ServerError {
  readonly head = 'Internal Server Error';
  readonly name = 'InternalServerError';
}

export const validationErrorHandler: ValidationErrorRequestHandler = (
  errors,
  _request,
  _response,
  next,
) => {
  next(
    new BadRequestError(
      'validation error',
      undefined,
      errors.map(({ errors: error, type }) => ({
        error: z.treeifyError(error),
        type,
      })),
    ),
  );
};

const unwrapAppError = (error: any): [AppError, string[]] => {
  const accumulator: Error[] = [];

  const unwrap = (error_: any) => {
    if (!error_) return;
    if (!(error_ instanceof Error)) return;

    accumulator.unshift(error_);
    unwrap(error_.cause);
  };

  unwrap(error);

  let appError: AppError | undefined;

  for (const error_ of accumulator) {
    if (!(error_ instanceof AppError)) continue;

    appError = error_;
    break;
  }

  if (!appError) {
    const error_ = accumulator.at(0);
    const { message, name } = error_ ?? {};

    appError = new InternalServerError(
      'failed to unwrap error',
      { cause: error_ },
      { message, name },
    );
  }

  return [
    appError,
    accumulator.map(
      ({ message }) => message.split('\n').at(0)?.trim() as string,
    ),
  ] as const;
};

export const appErrorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  const [appError, errorChain] = unwrapAppError(error);
  const { code, data, head, message, name, stack } = appError;

  logger[appError instanceof ClientError ? 'warn' : 'error'](
    {
      code,
      data,
      errorChain,
      head,
      message,
      name,
      stack,
    },
    `request error (${name})`,
  );

  response.status(code).json({
    code,
    data,
    errorChain,
    head,
    message,
    name,
  });

  return next();
};

const ErrorBody = registry.register(
  'ErrorBody',
  z.strictObject({
    code: z.int().positive().openapi({ description: 'http error code' }),
    data: z.object().openapi({ description: 'data from error object' }),
    errorChain: z
      .array(z.string())
      .openapi({ description: 'error messages from throw chain' }),
    head: z.string().openapi({ description: 'friendly error type name' }),
    message: z.string().openapi({ description: 'error message' }),
    name: z.string().openapi({ description: 'error type name' }),
  }),
);

export const errorResponses: RouteConfig['responses'] = {
  400: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'bad request error body',
  },
  404: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'not found error body',
  },
  405: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'method not allowed error body',
  },
  409: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'conflict error body',
  },
  500: {
    content: {
      'application/json': {
        schema: ErrorBody,
      },
    },
    description: 'internal server error body',
  },
};
