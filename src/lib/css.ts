/**
 * A URL wrapped for use in a CSS `url()`. The archive's image filenames contain
 * spaces ("Invokers Secrets.png"), and an unquoted `url()` with whitespace is
 * invalid CSS — the CSSOM silently drops the whole declaration, so the banner
 * never renders. Quoting makes any URL safe; quotes and backslashes inside the
 * URL are the only characters that then still need escaping.
 */
export function cssUrl(url: string): string {
  return `url("${url.replace(/[\\"]/g, '\\$&')}")`
}
