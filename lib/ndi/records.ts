import "server-only";

/**
 * The "database" for this demo: an in-memory store, pre-populated with a seed
 * and writable at runtime via the demo panel at the bottom of the page.
 *
 * Pinned to `globalThis`, and that is load-bearing rather than defensive.
 * Next.js dev (Turbopack) compiles route handlers on demand, per route — two
 * routes can end up holding separate instances of the same module, so a plain
 * module-level `const` silently stops being shared. Records added through
 * /api/records would then be invisible to /webhook, and issuance would report
 * "not registered" for a CID you had just added. (Confirmed failure mode: it
 * already bit lib/ndi/sessions.ts, which is fixed the same way.)
 *
 * Swap for a real table later: the four exported functions are the whole seam.
 */
export type PassengerRecord = {
  /** The value disclosed as the configured subject attribute (see
   *  proofRequest.subjectAttribute in config.ts — "ID Number" today). */
  cid: string;
  /**
   * Placed verbatim into `credentialData` when issuing this passenger's VC.
   * Keys must match the issuance schema's attribute names exactly.
   */
  credentialData: Record<string, string>;
  /** Lets the UI distinguish the built-in seed from records added by hand. */
  source: "seed" | "manual";
  addedAt: number;
};

/**
 * Form field -> issuance schema attribute name.
 *
 * The schema matches these literally, so "Bank Name" keeps its space and
 * capitalisation. Defined once here so a schema change is a one-line edit
 * rather than a hunt through the API route and the UI.
 */
export const CREDENTIAL_FIELDS = {
  cif: "CIF",
  bankName: "Bank Name",
} as const;

/** Guard against the demo panel being used to grow this without bound. */
export const MAX_RECORDS = 50;

const SEED: PassengerRecord[] = [
  {
    // Placeholder CID for testing — replace with a real one from the
    // `[ndi-webhook] RAW body` log, or just add yours via the demo panel.
    cid: "11305003415",
    credentialData: {
      [CREDENTIAL_FIELDS.cif]: "1234",
      [CREDENTIAL_FIELDS.bankName]: "BOB",
    },
    source: "seed",
    addedAt: 0,
  },
];

const globalForRecords = globalThis as unknown as {
  __ndiRecords?: Map<string, PassengerRecord>;
};

function store(): Map<string, PassengerRecord> {
  if (!globalForRecords.__ndiRecords) {
    const map = new Map<string, PassengerRecord>();
    for (const record of SEED) map.set(record.cid, record);
    globalForRecords.__ndiRecords = map;
  }
  return globalForRecords.__ndiRecords;
}

export function findRecordByCid(cid: string): PassengerRecord | undefined {
  return store().get(cid.trim());
}

/** Newest first, so a record just added by hand appears at the top. */
export function listRecords(): PassengerRecord[] {
  return [...store().values()].sort((a, b) => b.addedAt - a.addedAt);
}

export type UpsertResult =
  | { ok: true; record: PassengerRecord; replaced: boolean }
  | { ok: false; error: string };

export function upsertRecord(input: {
  cid: string;
  cif: string;
  bankName: string;
}): UpsertResult {
  const cid = input.cid.trim();
  const cif = input.cif.trim();
  const bankName = input.bankName.trim();

  if (!cid) return { ok: false, error: "ID Number is required" };
  if (!cif) return { ok: false, error: "CIF is required" };
  if (!bankName) return { ok: false, error: "Bank Name is required" };
  if (cid.length > 64 || cif.length > 64 || bankName.length > 64) {
    return { ok: false, error: "Values must be 64 characters or fewer" };
  }

  const records = store();
  const replaced = records.has(cid);
  // Only the size cap can reject a *new* record; overwriting an existing CID is
  // always allowed, otherwise a full store couldn't be corrected.
  if (!replaced && records.size >= MAX_RECORDS) {
    return { ok: false, error: `Limit of ${MAX_RECORDS} records reached` };
  }

  const record: PassengerRecord = {
    cid,
    credentialData: {
      [CREDENTIAL_FIELDS.cif]: cif,
      [CREDENTIAL_FIELDS.bankName]: bankName,
    },
    source: "manual",
    addedAt: Date.now(),
  };
  records.set(cid, record);
  return { ok: true, record, replaced };
}

export function removeRecord(cid: string): boolean {
  return store().delete(cid.trim());
}
