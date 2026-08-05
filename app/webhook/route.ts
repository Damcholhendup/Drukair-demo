import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { mask, readAttrs } from "@/lib/ndi/attrs";
import { NdiError, issueCredential, unsubscribeWebhook } from "@/lib/ndi/client";
import { issuance, proofRequest, server } from "@/lib/ndi/config";
import { type PassengerRecord, findRecordByCid } from "@/lib/ndi/records";
import { getSession, resolveIfPending, setIssuance } from "@/lib/ndi/sessions";

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

      const names = proofRequest.attributes.map((a) => a.name);
      const attributes = readAttrs(revealed, selfAttested, names);
      const subject = attributes[proofRequest.subjectAttribute];

      if (!subject) {
        // A validated proof that discloses nothing usable is nearly always a
        // schema or attribute-name mismatch on our side, not a real refusal.
        console.error(
          "[ndi-webhook] validated proof disclosed no %s (thread=%s) — check the schema URL and attribute names in lib/ndi/config.ts",
          proofRequest.subjectAttribute,
          thid,
        );
        if (
          resolveIfPending(thid, "FAILED", {
            reason: `Proof did not include ${proofRequest.subjectAttribute}`,
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
      const record = findRecordByCid(subject);

      const resolved = resolveIfPending(thid, record ? "VERIFIED" : "NOT_REGISTERED", {
        attributes,
        holderDid,
        relationshipDid,
      });

      if (!resolved) return;

      void unsubscribeWebhook(thid); // fire-and-forget: don't delay the 202
      console.log(
        "[ndi-webhook] proof validated thread=%s %s=%s holder=%s registered=%s",
        thid,
        proofRequest.subjectAttribute,
        mask(subject),
        mask(holderDid, 8),
        Boolean(record),
      );

      if (!record) {
        console.warn(
          "[ndi-webhook] no record for %s (thread=%s) — nothing to issue",
          mask(subject),
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
      void issueForRecord(thid, record, holderDid, relationshipDid);
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
  record: PassengerRecord,
  holderDid: string,
  relationshipDid: string | null,
) {
  try {
    const result = await issueCredential({
      credentialData: record.credentialData,
      schemaId: issuance.schemaId(),
      holderDID: holderDid,
      // Passing the relationship we already have is what lets NDI push this
      // straight to the wallet — no second QR to scan.
      forRelationship: relationshipDid ?? "",
    });

    setIssuance(thid, {
      status: "issued",
      credInviteURL: result.credInviteURL || undefined,
      deepLinkURL: result.deepLinkURL || undefined,
      issueCredThreadId: result.issueCredThreadId,
      revocationId: result.revocationId,
    });
    console.log(
      "[ndi-webhook] credential issued thread=%s issueCredThreadId=%s viaExistingRelationship=%s",
      thid,
      result.issueCredThreadId,
      Boolean(relationshipDid),
    );
  } catch (error) {
    const detail =
      error instanceof NdiError ? `${error.message} (${error.detail ?? ""})` : String(error);
    setIssuance(thid, { status: "failed", reason: "Credential issuance failed" });
    console.error("[ndi-webhook] issuance FAILED thread=%s — %s", thid, detail);
  }
}
