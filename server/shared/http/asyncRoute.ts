import type { RequestHandler } from 'express';

export function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve(handler(request, response, next)).catch(next);
  };
}
