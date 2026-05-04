import { Transformer } from 'node:stream/web';

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

export class SizeLimitedStream<
  T extends { length: number },
> extends TransformStream<T> {
  private _accumulatedLength = 0;

  constructor(readonly limit: number) {
    super({
      flush: () => {
        this._accumulatedLength = 0;
      },
      transform: (chunk, controller) => {
        const accumulatedLength = this._accumulatedLength + chunk.length;
        if (accumulatedLength > limit) {
          controller.terminate();
          this._accumulatedLength = 0;

          return;
        }

        this._accumulatedLength = accumulatedLength;
        controller.enqueue(chunk);
      },
    });
  }
}
