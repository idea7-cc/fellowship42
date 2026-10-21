/**
 * Whether a collection query failed only because its `cursor` was malformed.
 * EmDash 1.0.1 wraps its `InvalidCursorError` into a plain `Error` ("Failed
 * to load collection: Invalid pagination cursor: …") without a cause, so the
 * message is the only signal left. Anything else is a real failure.
 */
export function isInvalidCursorError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'InvalidCursorError' ||
      error.message.includes('Invalid pagination cursor'))
  )
}
