export const safeAsync = async <T>(
  promise: Promise<T> | T,
): Promise<[undefined, T] | [Error, undefined]> => {
  try {
    const result = await promise;
    return [undefined, result] as const;
  } catch (error) {
    if (error instanceof Error) {
      return [error, undefined] as const;
    }

    return [
      new Error('safeAsync encountered non-error value being thrown', {
        cause: error,
      }),
      undefined,
    ] as const;
  }
};
