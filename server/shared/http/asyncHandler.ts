import type { RequestHandler } from 'express';

/** Forward synchronous throws and rejected Express 4 handlers to error middleware. */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    try {
      void Promise.resolve(handler(request, response, next)).catch(next);
    } catch (error) {
      next(error);
    }
  };
}
