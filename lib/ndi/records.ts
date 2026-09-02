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
 * Swap for a real table later: the exported functions are the whole seam.
 */
export type PassengerRecord = {
  /** The value disclosed as the configured subject attribute (see
   *  proofRequest.subjectAttribute in config.ts — "ID Number" today). This is
   *  the proof lookup key, not an issuance schema field — the UI labels it
   *  "CID", since that is what this value actually is for a Bhutanese
   *  citizen, but it is not one of `ticketData`/`boardingData`'s keys. */
  cid: string;
  /** Issued verbatim as the Ticket VC (via `toIssuancePayload` below) at the
   *  ticket stage. Keys must match TICKET_FIELDS / the ticket schema exactly. */
  ticketData: Record<string, string>;
  /** Issued verbatim as the Boarding Pass VC at the boarding stage (online
   *  flow) or the walk-in flow's single stage. Keys must match
   *  BOARDING_FIELDS / the boarding-pass schema exactly. */
  boardingData: Record<string, string>;
  /** Lets the UI distinguish the built-in seed from records added by hand. */
  source: "seed" | "manual";
  addedAt: number;
  /**
   * Set once the ticket-stage VC has been issued for this CID — the online
   * flow's boarding-pass stage (see app/webhook/route.ts) refuses to issue
   * until this is present, enforcing that boarding must follow a ticket. The
   * walk-in flow ignores this entirely.
   *
   * This is flow state riding on the registry record rather than a separate
   * table, which is fine for a demo with one credential per CID in flight at
   * a time; a real system would key this off a specific booking, not the CID.
   */
  ticketIssuedAt?: number;
  /** The relationship_did captured when the ticket was issued — reused to
   *  target the boarding-pass proof request directly when boarding.noRescan
   *  is on (see lib/ndi/config.ts). */
  ticketRelationshipDid?: string | null;
};

/**
 * Ticket VC schema attribute names — form field key -> schema attribute name.
 * Matched **literally** by NDI, so get these exact: e.g. "Flight No" keeps its
 * space. Confirmed directly against a real issuance payload for schema
 * `9e3c9c24-5b19-49b0-9af9-d44770b70124`.
 *
 * Defined once here so a schema change is a one-line edit rather than a hunt
 * through the API route and the UI.
 */
export const TICKET_FIELDS = {
  passengerName: "Passenger Name",
  bookingReference: "Booking Reference",
  ticketNumber: "Ticket Number",
  issuedBy: "Issued By",
  carrierCode: "Carrier Code",
  flightNo: "Flight No",
  departureTime: "Departure Time",
  arrivalTime: "Arrival Time",
  seat: "Seat",
} as const;

/**
 * Boarding Pass VC schema attribute names, same convention as TICKET_FIELDS.
 * Confirmed against a real issuance payload for schema
 * `8aef1837-98d6-437b-b682-53866d4e0e27`. Note "Seq. No" keeps its period, and
 * this schema has its own "Flight" / "Seat No" distinct from the ticket
 * schema's "Flight No" / "Seat" — same-looking concepts, different attribute
 * names, because they're different schemas.
 */
export const BOARDING_FIELDS = {
  airline: "Airline",
  travelClass: "Class",
  nameOfPassenger: "Name of Passenger",
  from: "From",
  to: "To",
  flight: "Flight",
  date: "Date",
  seqNo: "Seq. No",
  boardingTime: "Boarding Time",
  seatNo: "Seat No",
  gate: "Gate",
} as const;

/**
 * Attribute names that must be sent as JSON numbers rather than strings — not
 * visible from the attribute name itself, only from NDI's validation error
 * (see the SIM-registration schema this replaced, which had exactly this
 * issue with "Mobile Number"). Empty today: every attribute in both current
 * schemas is a string. Add here the moment a future schema needs otherwise.
 */
const NUMERIC_FIELDS = new Set<string>();

/**
 * Converts a record's (all-string) data into the exact wire shape NDI
 * expects — numeric-typed attributes as JSON numbers, everything else
 * untouched. This is the ONLY place that conversion happens, so a future
 * schema's numeric fields are a one-line change to `NUMERIC_FIELDS`, not a
 * hunt through the issuance call site.
 */
export function toIssuancePayload(
  data: Record<string, string>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = NUMERIC_FIELDS.has(key) ? Number(value) : value;
  }
  return out;
}

/** Guard against the demo panel being used to grow this without bound. */
export const MAX_RECORDS = 50;

const SEED: PassengerRecord[] = [
  {
    // Placeholder CID for testing — replace with a real one from the
    // `[ndi-webhook] RAW body` log, or just add yours via the demo panel.
    cid: "10402000479",
    ticketData: {
      [TICKET_FIELDS.passengerName]: "Demo Passenger",
      [TICKET_FIELDS.bookingReference]: "BR12345",
      [TICKET_FIELDS.ticketNumber]: "TKT001",
      [TICKET_FIELDS.issuedBy]: "Drukair",
      [TICKET_FIELDS.carrierCode]: "KB",
      [TICKET_FIELDS.flightNo]: "KB101",
      [TICKET_FIELDS.departureTime]: "09:00",
      [TICKET_FIELDS.arrivalTime]: "11:00",
      [TICKET_FIELDS.seat]: "12A",
    },
    boardingData: {
      [BOARDING_FIELDS.airline]: "Drukair",
      [BOARDING_FIELDS.travelClass]: "Economy",
      [BOARDING_FIELDS.nameOfPassenger]: "Demo Passenger",
      [BOARDING_FIELDS.from]: "Paro",
      [BOARDING_FIELDS.to]: "Bangkok",
      [BOARDING_FIELDS.flight]: "KB101",
      [BOARDING_FIELDS.date]: "2026-08-19",
      [BOARDING_FIELDS.seqNo]: "045",
      [BOARDING_FIELDS.boardingTime]: "08:30",
      [BOARDING_FIELDS.seatNo]: "12A",
      [BOARDING_FIELDS.gate]: "Gate 2",
    },
    source: "seed",
    addedAt: 0,
  },
  {
    cid: "11102007386",
    ticketData: {
      [TICKET_FIELDS.passengerName]: "Demo Passenger",
      [TICKET_FIELDS.bookingReference]: "BR07386",
      [TICKET_FIELDS.ticketNumber]: "TKT386",
      [TICKET_FIELDS.issuedBy]: "Drukair",
      [TICKET_FIELDS.carrierCode]: "KB",
      [TICKET_FIELDS.flightNo]: "KB202",
      [TICKET_FIELDS.departureTime]: "13:00",
      [TICKET_FIELDS.arrivalTime]: "15:15",
      [TICKET_FIELDS.seat]: "9F",
    },
    boardingData: {
      [BOARDING_FIELDS.airline]: "Drukair",
      [BOARDING_FIELDS.travelClass]: "Economy",
      [BOARDING_FIELDS.nameOfPassenger]: "Demo Passenger",
      [BOARDING_FIELDS.from]: "Paro",
      [BOARDING_FIELDS.to]: "Delhi",
      [BOARDING_FIELDS.flight]: "KB202",
      [BOARDING_FIELDS.date]: "2026-08-19",
      [BOARDING_FIELDS.seqNo]: "086",
      [BOARDING_FIELDS.boardingTime]: "12:30",
      [BOARDING_FIELDS.seatNo]: "9F",
      [BOARDING_FIELDS.gate]: "Gate 3",
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

/**
 * Looks up a record by the Ticket Number disclosed from a Ticket VC proof —
 * used by the online flow's boarding stage, which (unlike the ticket stage
 * and walk-in) verifies the ticket itself rather than the passenger's CID.
 * O(n) over the store, which is fine at demo scale; a real table would index
 * this the same way it indexes CID.
 */
export function findRecordByTicketNumber(ticketNumber: string): PassengerRecord | undefined {
  const value = ticketNumber.trim();
  for (const record of store().values()) {
    if (record.ticketData[TICKET_FIELDS.ticketNumber] === value) return record;
  }
  return undefined;
}

export type UpsertResult =
  | { ok: true; record: PassengerRecord; replaced: boolean }
  | { ok: false; error: string };

export function upsertRecord(input: {
  cid: string;
  ticket: Record<keyof typeof TICKET_FIELDS, string>;
  boarding: Record<keyof typeof BOARDING_FIELDS, string>;
}): UpsertResult {
  const cid = input.cid.trim();
  if (!cid) return { ok: false, error: "CID is required" };

  const ticketData: Record<string, string> = {};
  for (const [key, attr] of Object.entries(TICKET_FIELDS)) {
    const value = (input.ticket[key as keyof typeof TICKET_FIELDS] ?? "").trim();
    if (!value) return { ok: false, error: `${attr} is required` };
    if (value.length > 64) return { ok: false, error: `${attr} must be 64 characters or fewer` };
    ticketData[attr] = value;
  }

  const boardingData: Record<string, string> = {};
  for (const [key, attr] of Object.entries(BOARDING_FIELDS)) {
    const value = (input.boarding[key as keyof typeof BOARDING_FIELDS] ?? "").trim();
    if (!value) return { ok: false, error: `${attr} is required` };
    if (value.length > 64) return { ok: false, error: `${attr} must be 64 characters or fewer` };
    boardingData[attr] = value;
  }

  if (cid.length > 64) return { ok: false, error: "CID must be 64 characters or fewer" };

  const records = store();
  const replaced = records.has(cid);
  // Only the size cap can reject a *new* record; overwriting an existing CID is
  // always allowed, otherwise a full store couldn't be corrected.
  if (!replaced && records.size >= MAX_RECORDS) {
    return { ok: false, error: `Limit of ${MAX_RECORDS} records reached` };
  }

  // Re-adding an existing CID resets its ticket status — treat it as a fresh
  // registration rather than silently carrying over a stale issuance.
  const record: PassengerRecord = {
    cid,
    ticketData,
    boardingData,
    source: "manual",
    addedAt: Date.now(),
  };
  records.set(cid, record);
  return { ok: true, record, replaced };
}

export function removeRecord(cid: string): boolean {
  return store().delete(cid.trim());
}

/**
 * Marks a record as having received its ticket VC, so the online flow's
 * boarding-pass stage knows to allow issuance. No-op if the CID isn't
 * registered — the ticket webhook already refused to issue in that case, so
 * this should never happen.
 */
export function markTicketIssued(cid: string, relationshipDid: string | null): void {
  const records = store();
  const record = records.get(cid);
  if (!record) return;
  records.set(cid, {
    ...record,
    ticketIssuedAt: Date.now(),
    ticketRelationshipDid: relationshipDid,
  });
}
