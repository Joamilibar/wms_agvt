/**
 * Escapes a user-supplied string so it can be embedded in a `$regex` filter
 * as a literal. Without it, a search for `SKU-0(` fails the query outright and
 * a search for `.*` matches everything (M-06).
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
