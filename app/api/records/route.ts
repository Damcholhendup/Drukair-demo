import { NextResponse } from "next/server";
import {
  CREDENTIAL_FIELDS,
  MAX_RECORDS,
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
    fields: CREDENTIAL_FIELDS,
    max: MAX_RECORDS,
  });
}

export async function POST(request: Request) {
  let body: { cid?: unknown; cif?: unknown; bankName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = upsertRecord({
    cid: typeof body.cid === "string" ? body.cid : "",
    cif: typeof body.cif === "string" ? body.cif : "",
    bankName: typeof body.bankName === "string" ? body.bankName : "",
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
