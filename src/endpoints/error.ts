/* eslint-disable @typescript-eslint/no-explicit-any */
import { ErrorRequestHandler } from 'express';
import { ErrorRequestHandler as ValidationErrorRequestHandler } from 'express-zod-safe';
import z from 'zod';

import { makeLogger } from '../logging.js';

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

export class BadRequestError extends AppError {
  readonly code = 400;
  readonly head = 'Bad Request';
  readonly name = 'BadRequestError';
}

export class NotFoundError extends AppError {
  readonly code = 404;
  readonly head = 'Not Found';
  readonly name = 'NotFoundError';
}

export class MethodNotAllowedError extends AppError {
  readonly code = 405;
  readonly head = 'Method Not Allowed';
  readonly name = 'MethodNotAllowedError';
}

export class ConflictError extends AppError {
  readonly code = 409;
  readonly head = 'Conflict';
  readonly name = 'ConflictError';
}

export class InternalServerError extends AppError {
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
  const appError = unwrapAppError(error);
  if (!appError) return next();

  const [{ code, data, head, message, name }, errorChain] = appError;

  logger.error(
    {
      code,
      data,
      errorChain,
      head,
      message,
      name,
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
