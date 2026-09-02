import { NextResponse } from "next/server";
import { consumeVerified, getSession, isExpired } from "@/lib/ndi/sessions";

export const dynamic = "force-dynamic";

/**
 * GET /api/ndi/status/:threadId
 *
 * Polled by the popup until the check-in resolves. Returns one of:
 *   { status: "pending" }
 *   { status: "verified", attributes, holderDid, relationshipDid, issuance } — delivered once
 *   { status: "consumed", issuance }              — every poll after the first
 *   { status: "not_registered" }                   — proof OK, no matching record
 *   { status: "not_ticketed" }        — boarding proof OK, but no ticket VC issued yet
 *   { status: "declined" }
 *   { status: "failed", reason }
 *   { status: "expired" }
 *
 * `issuance` tracks the follow-on credential issuance (a separate, slower NDI
 * call made after the proof already resolved) and is included on every
 * verified/consumed read — unlike `attributes`, it isn't single-use, since the
 * frontend needs to keep polling until issuance itself finishes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const session = getSession(threadId);

  if (!session) {
    // Also the answer for a purged or invented thread — deliberately no detail.
    return NextResponse.json({ status: "unknown" }, { status: 404 });
  }

  if (session.status === "PENDING") {
    // Reported by age, never written: leaving the row PENDING means a late but
    // genuine webhook can still resolve it, and avoids a poll/webhook race.
    return NextResponse.json({ status: isExpired(session) ? "expired" : "pending" });
  }

  if (session.status === "VERIFIED") {
    // Single-use for the disclosed attributes only. Without this the threadId
    // would act as a bearer credential, re-reading them on every poll.
    const claimed = consumeVerified(threadId);
    if (!claimed) {
      return NextResponse.json({ status: "consumed", issuance: session.issuance ?? null });
    }

    return NextResponse.json({
      status: "verified",
      attributes: claimed.attributes ?? {},
      holderDid: claimed.holderDid ?? null,
      relationshipDid: claimed.relationshipDid ?? null,
      issuance: claimed.issuance ?? null,
    });
  }

  if (session.status === "CONSUMED") {
    return NextResponse.json({ status: "consumed", issuance: session.issuance ?? null });
  }

  if (session.status === "NOT_REGISTERED") {
    return NextResponse.json({ status: "not_registered" });
  }

  if (session.status === "NOT_TICKETED") {
    return NextResponse.json({ status: "not_ticketed" });
  }

  if (session.status === "REJECTED") return NextResponse.json({ status: "declined" });

  return NextResponse.json({
    status: "failed",
    reason: session.reason ?? "Check-in could not be completed",
  });
}
