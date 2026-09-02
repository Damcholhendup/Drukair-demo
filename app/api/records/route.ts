import { NextResponse } from "next/server";
import {
  BOARDING_FIELDS,
  MAX_RECORDS,
  TICKET_FIELDS,
  listRecords,
  removeRecord,
  upsertRecord,
} from "@/lib/ndi/records";

export const dynamic = "force-dynamic";

/**
 * Demo seed data management, backing the panel at the bottom of the page.
 *
 * DELIBERATELY UNAUTHENTICATED, and that is only acceptable because this is a
 * local demo. These endpoints decide who can be issued a credential, so anyone
 * who can reach them can add themselves. Put this behind auth — or delete it —
 * before this is exposed anywhere public.
 */

export async function GET() {
  return NextResponse.json({
    records: listRecords(),
    ticketFields: TICKET_FIELDS,
    boardingFields: BOARDING_FIELDS,
    max: MAX_RECORDS,
  });
}

/** Pulls every TICKET_FIELDS/BOARDING_FIELDS key out of a sub-object,
 *  defaulting anything missing or non-string to "" — validated properly by
 *  upsertRecord, which is the single source of truth for what's required. */
function strings<K extends string>(
  fieldMap: Record<K, string>,
  source: unknown,
): Record<K, string> {
  const obj = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  const out = {} as Record<K, string>;
  for (const key of Object.keys(fieldMap) as K[]) {
    const value = obj[key];
    out[key] = typeof value === "string" ? value : "";
  }
  return out;
}

export async function POST(request: Request) {
  let body: { cid?: unknown; ticket?: unknown; boarding?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = upsertRecord({
    cid: typeof body.cid === "string" ? body.cid : "",
    ticket: strings(TICKET_FIELDS, body.ticket),
    boarding: strings(BOARDING_FIELDS, body.boarding),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  console.log(
    "[records] %s cid=%s",
    result.replaced ? "updated" : "added",
    result.record.cid,
  );
  return NextResponse.json(
    { record: result.record, replaced: result.replaced, records: listRecords() },
    { status: result.replaced ? 200 : 201 },
  );
}

export async function DELETE(request: Request) {
  const cid = new URL(request.url).searchParams.get("cid");
  if (!cid) {
    return NextResponse.json({ error: "cid query parameter is required" }, { status: 400 });
  }

  const removed = removeRecord(cid);
  if (!removed) {
    return NextResponse.json({ error: "No such record" }, { status: 404 });
  }

  console.log("[records] removed cid=%s", cid);
  return NextResponse.json({ records: listRecords() });
}
