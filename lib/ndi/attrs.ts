/**
 * Readers for the attributes a wallet discloses in a proof presentation.
 *
 * NDI splits them across two maps with different shapes:
 *   revealed_attrs      (schema-backed) { "ID Number": [{ value, identifier_index }] }
 *   self_attested_attrs (user-entered)  { "Email": "someone@example.bt" }
 *
 * Some credentials arrive self-attested rather than revealed, so a reader that
 * only checks one map silently loses values. Keys are also matched
 * case-insensitively, so a minor naming drift degrades to a match instead of a
 * mysterious empty result.
 */

/** Pulls a string out of whichever shape the value is wrapped in. */
function coerce(entry: unknown): string | null {
  if (entry == null) return null;

  if (typeof entry === "string") return entry.trim() || null;

  if (Array.isArray(entry)) {
    const first = entry[0];
    const value =
      first && typeof first === "object"
        ? (first as { value?: unknown }).value
        : first;
    return typeof value === "string" ? value.trim() || null : null;
  }

  if (typeof entry === "object") {
    const value = (entry as { value?: unknown }).value;
    return typeof value === "string" ? value.trim() || null : null;
  }

  return null;
}

/** Exact key first, then case-insensitive. */
function pick(source: unknown, name: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  if (record[name] !== undefined) return record[name];
  const key = Object.keys(record).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  return key === undefined ? undefined : record[key];
}

/** Reads one attribute, preferring the schema-backed map. */
export function readAttr(
  revealed: unknown,
  selfAttested: unknown,
  name: string,
): string | null {
  return coerce(pick(revealed, name)) ?? coerce(pick(selfAttested, name));
}

/** Reads every requested attribute, omitting any the wallet withheld. */
export function readAttrs(
  revealed: unknown,
  selfAttested: unknown,
  names: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = readAttr(revealed, selfAttested, name);
    if (value !== null) out[name] = value;
  }
  return out;
}

/** Masks a value for logs — enough to correlate, not enough to identify. */
export function mask(value: string | null | undefined, visible = 4): string {
  if (!value) return "(none)";
  if (value.length <= visible) return "*".repeat(value.length);
  return `${"*".repeat(value.length - visible)}${value.slice(-visible)}`;
}
