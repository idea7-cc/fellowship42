import { HTTPException } from 'hono/http-exception'

export class AppError extends HTTPException {
  constructor(
    status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 500 | 503,
    readonly code: string,
    message: string,
  ) {
    super(status, { message })
  }
}
