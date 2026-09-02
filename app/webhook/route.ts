import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { mask, readAttrs } from "@/lib/ndi/attrs";
import { NdiError, issueCredential, unsubscribeWebhook } from "@/lib/ndi/client";
import {
  boardingProofRequest,
  issuance,
  server,
  ticketProofRequest,
  walkinProofRequest,
} from "@/lib/ndi/config";
import {
  type PassengerRecord,
  findRecordByCid,
  findRecordByTicketNumber,
  markTicketIssued,
  toIssuancePayload,
} from "@/lib/ndi/records";
import { type SessionKind, getSession, resolveIfPending, setIssuance } from "@/lib/ndi/sessions";

/** Which proof config governs a session, keyed by its kind. */
function proofConfigFor(kind: SessionKind) {
  if (kind === "boarding") return boardingProofRequest;
  if (kind === "walkin") return walkinProofRequest;
  return ticketProofRequest;
}

export const dynamic = "force-dynamic";

/**
 * Verifies the inbound callback really came from NDI.
 *
 * With OAuth2 v2, NDI returns the fixed token we set at registration in the
 * Authorization header. This comparison is the ONLY thing standing between a
 * forged "proof validated" POST and a passenger being checked in without ever
 * presenting a credential — so it is constant-time, and a missing config
 * rejects rather than defaulting open.
 */
function isAuthentic(request: Request): boolean {
  let expected: string;
  try {
    expected = server.webhookAuthToken;
  } catch {
    console.error("[ndi-webhook] NDI_WEBHOOK_AUTH_TOKEN is not set — rejecting");
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  // NDI has been seen to send both "Bearer <token>" and a bare token.
  const provided = header.replace(/^Bearer\s+/i, "").trim();

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length must be compared separately; timingSafeEqual throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /webhook
 *
 * The single callback target registered with NDI, shared by every thread.
 *
 * Retry contract: NDI retries up to ten times with backoff until it receives a
 * 2xx. So anything we have genuinely dealt with — including callbacks we
 * intentionally ignore — must return 202, or NDI will keep redelivering it.
 * Only an unexpected server-side fault returns 500, where a retry might help.
 */
export async function POST(request: Request) {
  if (!isAuthentic(request)) {
    console.warn("[ndi-webhook] rejected: bad or missing Authorization header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Malformed JSON will never become valid on redelivery.
    console.warn("[ndi-webhook] rejected: body was not JSON");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Full raw payload, unmasked — while we're still confirming which fields NDI
  // actually sends (e.g. relationship_did) it's more useful to see everything
  // than to guess which parts matter and mask the rest.
  //
  // This is a staging/integration aid, not a production stance: it prints
  // disclosed identity attributes in plaintext to the server console. Narrow
  // this back down (names only, values masked — see `mask` below) before this
  // handles real passenger data.
  console.log("[ndi-webhook] RAW body:\n%s", JSON.stringify(body, null, 2));

  try {
    await handleCallback(body);
  } catch (error) {
    // Genuine fault on our side — let NDI retry.
    console.error(
      "[ndi-webhook] handler threw — %s",
      error instanceof Error ? error.stack : String(error),
    );
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ statusCode: 202, message: "Accepted" }, { status: 202 });
}

async function handleCallback(body: Record<string, unknown>) {
  const type = typeof body.type === "string" ? body.type : undefined;
  const thid = typeof body.thid === "string" ? body.thid : undefined;

  if (!thid) {
    console.warn("[ndi-webhook] callback with no thid, type=%s", type);
    return;
  }

  const session = getSession(thid);
  if (!session) {
    // Could be a thread from another flow, or one we already purged. Not an error.
    console.log("[ndi-webhook] no session for thread=%s type=%s — ignoring", thid, type);
    return;
  }
  if (session.status !== "PENDING") {
    // Already resolved. NDI re-delivering is normal; this is the idempotent path.
    console.log("[ndi-webhook] thread=%s already %s — ignoring", thid, session.status);
    return;
  }

  switch (type) {
    case "present-proof/rejected": {
      if (resolveIfPending(thid, "REJECTED")) {
        void unsubscribeWebhook(thid); // fire-and-forget: don't delay the 202
        console.log("[ndi-webhook] declined by holder thread=%s", thid);
      }
      return;
    }

    case "present-proof/presentation-result": {
      const verified = body.verification_result === "ProofValidated";
      if (!verified) {
        if (resolveIfPending(thid, "FAILED", { reason: "Proof could not be verified" })) {
          void unsubscribeWebhook(thid);
          console.warn(
            "[ndi-webhook] verification_result=%s thread=%s",
            String(body.verification_result),
            thid,
          );
        }
        return;
      }

      const presentation = (body.requested_presentation ?? {}) as Record<string, unknown>;
      const revealed = presentation.revealed_attrs;
      const selfAttested = presentation.self_attested_attrs;

      // Log attribute NAMES only, never values. Seeing the key sets side by side
      // is what makes a schema/naming mismatch obvious.
      console.log(
        "[ndi-webhook] thread=%s revealed=[%s] self_attested=[%s]",
        thid,
        Object.keys((revealed ?? {}) as object).join(", "),
        Object.keys((selfAttested ?? {}) as object).join(", "),
      );

      const proofConfig = proofConfigFor(session.kind);
      const names = proofConfig.attributes.map((a) => a.name);
      const attributes = readAttrs(revealed, selfAttested, names);
      const subject = attributes[proofConfig.subjectAttribute];

      if (!subject) {
        // A validated proof that discloses nothing usable is nearly always a
        // schema or attribute-name mismatch on our side, not a real refusal.
        console.error(
          "[ndi-webhook] validated proof disclosed no %s (thread=%s kind=%s) — check the schema URL and attribute names in lib/ndi/config.ts",
          proofConfig.subjectAttribute,
          thid,
          session.kind,
        );
        if (
          resolveIfPending(thid, "FAILED", {
            reason: `Proof did not include ${proofConfig.subjectAttribute}`,
          })
        ) {
          void unsubscribeWebhook(thid);
        }
        return;
      }

      const holderDid = typeof body.holder_did === "string" ? body.holder_did : null;
      const relationshipDid =
        typeof body.relationship_did === "string" ? body.relationship_did : null;

      // Decided synchronously (in-memory lookup) so it lands in the SAME
      // PENDING→terminal transition as the proof result itself — a passenger
      // with no matching record is a distinct outcome from a valid proof, not a
      // second phase of it.
      //
      // Boarding looks up by Ticket Number (the subject it actually asked
      // for), not CID — ticket and walk-in still ask for, and match on, CID.
      const record =
        session.kind === "boarding" ? findRecordByTicketNumber(subject) : findRecordByCid(subject);

      // Boarding must follow ticket: a registered CID with no ticket VC yet is
      // a distinct outcome from "not registered at all", not a silent skip.
      // `ticket` and `walkin` both only need the CID itself to be registered —
      // walk-in has no earlier stage to gate on.
      const resolvedStatus =
        session.kind === "boarding"
          ? !record
            ? "NOT_REGISTERED"
            : !record.ticketIssuedAt
              ? "NOT_TICKETED"
              : "VERIFIED"
          : record
            ? "VERIFIED"
            : "NOT_REGISTERED";
      const canIssue = resolvedStatus === "VERIFIED";

      const resolved = resolveIfPending(thid, resolvedStatus, {
        attributes,
        holderDid,
        relationshipDid,
      });

      if (!resolved) return;

      void unsubscribeWebhook(thid); // fire-and-forget: don't delay the 202
      console.log(
        "[ndi-webhook] proof validated thread=%s kind=%s %s=%s holder=%s status=%s",
        thid,
        session.kind,
        proofConfig.subjectAttribute,
        mask(subject),
        mask(holderDid, 8),
        resolvedStatus,
      );

      if (!record || !canIssue) {
        console.warn(
          "[ndi-webhook] %s (thread=%s) — nothing to issue",
          resolvedStatus,
          thid,
        );
        return;
      }

      if (!holderDid) {
        // Can't issue to nobody. Distinct from FAILED above: the proof itself
        // was fine, issuance just has nothing to target.
        setIssuance(thid, { status: "failed", reason: "No holder DID was disclosed" });
        console.error("[ndi-webhook] cannot issue: no holder_did on thread=%s", thid);
        return;
      }

      // Issuing is a second, slower NDI call (the docs quote ~15s for the
      // sibling proof-request endpoint). Don't make NDI's webhook wait on it —
      // start it after the 202 is already on its way, and let /api/ndi/status
      // report progress via polling.
      setIssuance(thid, { status: "issuing" });
      void issueForRecord(thid, session.kind, record, holderDid, relationshipDid);
      return;
    }

    default: {
      // Leave the session PENDING; it will expire if nothing final arrives.
      console.warn("[ndi-webhook] unhandled type=%s thread=%s", type, thid);
      return;
    }
  }
}

/**
 * Issues the matched passenger's credential and records the outcome.
 *
 * Runs detached from the webhook's own request/response cycle (called with
 * `void`, not awaited) — see the call site above for why.
 */
async function issueForRecord(
  thid: string,
  kind: SessionKind,
  record: PassengerRecord,
  holderDid: string,
  relationshipDid: string | null,
) {
  try {
    // Boarding falls back to the relationship captured at the ticket step if
    // this particular proof somehow didn't carry one (e.g. a pushed request
    // NDI answered without echoing relationship_did back). Walk-in has no
    // earlier relationship to fall back to — it's always a fresh one.
    const forRelationship =
      relationshipDid ?? (kind === "boarding" ? record.ticketRelationshipDid : null) ?? "";

    // Walk-in issues the same boarding-pass credential as the online flow's
    // second stage, just without a ticket VC ever having existed for this CID.
    const schemaId =
      kind === "ticket" ? issuance.ticket.schemaId() : issuance.boarding.schemaId();
    const credentialData = kind === "ticket" ? record.ticketData : record.boardingData;

    const result = await issueCredential({
      credentialData: toIssuancePayload(credentialData),
      schemaId,
      holderDID: holderDid,
      // Passing the relationship we already have is what lets NDI push this
      // straight to the wallet — no second QR to scan.
      forRelationship,
    });

    // Unlocks the boarding-pass stage for this CID — only the ticket stage
    // does this; boarding issuance has nothing further to gate.
    if (kind === "ticket") {
      markTicketIssued(record.cid, relationshipDid);
    }

    setIssuance(thid, {
      status: "issued",
      credInviteURL: result.credInviteURL || undefined,
      deepLinkURL: result.deepLinkURL || undefined,
      issueCredThreadId: result.issueCredThreadId,
      revocationId: result.revocationId,
    });
    console.log(
      "[ndi-webhook] %s credential issued thread=%s issueCredThreadId=%s viaExistingRelationship=%s",
      kind,
      thid,
      result.issueCredThreadId,
      Boolean(forRelationship),
    );
  } catch (error) {
    const detail =
      error instanceof NdiError ? `${error.message} (${error.detail ?? ""})` : String(error);
    setIssuance(thid, { status: "failed", reason: "Credential issuance failed" });
    console.error("[ndi-webhook] issuance FAILED thread=%s — %s", thid, detail);
  }
}
