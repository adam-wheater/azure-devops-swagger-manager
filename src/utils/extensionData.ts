/**
 * True only when the server answered 404, i.e. the document has never been written.
 *
 * Anything else (a network blip, an expired token, a 5xx) proves nothing about the
 * document. Treating those as "missing" is how a failed read used to show the admin
 * claim page and re-seed empty settings over the stored ones.
 *
 * Duck-typed on purpose: rejections cross the extension iframe as plain objects, so
 * `instanceof` never matches. Server errors carry a numeric `status`; connectivity
 * failures (`NetworkException`) carry none.
 */
export function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { status?: unknown }).status === 404;
}
