import { NextResponse } from "next/server";
import { NdiError, createProofRequest, subscribeWebhook } from "@/lib/ndi/client";
import {
  boarding,
  boardingProofRequest,
  isWebhookConfigured,
  ticketProofRequest,
  walkinProofRequest,
} from "@/lib/ndi/config";
import { buildQrMatrix } from "@/lib/ndi/qr";
import { createSession } from "@/lib/ndi/sessions";

/** Never cache: every check-in needs its own proof request and thread ID. */
export const dynamic = "force-dynamic";

/**
 * Subscribes the thread, but never lets a subscribe failure take down the QR.
 *
 * This covers both "not configured" and "configured but NDI rejects it" (e.g.
 * the webhookId isn't registered yet) the same way: the QR is still valid and
 * scannable, the session just stays pending forever, which is the honest
 * outcome — nothing can resolve it without a working subscription.
 */
async function trySubscribe(threadId: string): Promise<boolean> {
  if (!isWebhookConfigured()) {
    console.warn(
      "[ndi] webhook not configured — skipping subscribe for thread %s. " +
        "Set NDI_WEBHOOK_ID / NDI_WEBHOOK_AUTH_TOKEN in .env.local.",
      threadId,
    );
    return false;
  }

  try {
    await subscribeWebhook(threadId);
    return true;
  } catch (error) {
    console.warn(
      "[ndi] subscribe failed for thread %s — %s",
      threadId,
      error instanceof NdiError ? `${error.message} (${error.detail ?? ""})` : String(error),
    );
    return false;
  }
}

/**
 * POST /api/ndi/proof-request
 *
 * Body: `{ kind?: "ticket" | "boarding" | "walkin", relationshipDid?: string }`.
 * `kind` defaults to "ticket" so the original no-body call still works.
 *
 * `relationshipDid` is only ever used to pick WHERE to deliver a `boarding`
 * request when `NDI_BOARDING_NO_RESCAN` is on — it is never trusted for who
 * the passenger is. That's still established the only way it ever is: by the
 * proof itself, verified in /webhook. `walkin` never has a prior relationship
 * to target — there is no earlier stage in that flow.
 */
export async function POST(request: Request) {
  let body: { kind?: unknown; relationshipDid?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // The ticket flow calls this with no body at all — that's fine.
  }

  const kind =
    body.kind === "boarding" ? "boarding" : body.kind === "walkin" ? "walkin" : "ticket";
  const cfg =
    kind === "boarding"
      ? boardingProofRequest
      : kind === "walkin"
        ? walkinProofRequest
        : ticketProofRequest;
  const targetRelationshipDid =
    kind === "boarding" && boarding.noRescan && typeof body.relationshipDid === "string"
      ? body.relationshipDid
      : null;

  try {
    const proof = await createProofRequest({
      proofName: cfg.proofName,
      purpose: cfg.purpose,
      attributes: cfg.attributes,
      targetRelationshipDid,
    });
    const threadId = proof.proofRequestThreadId;

    // Create the session BEFORE subscribing. If NDI calls back very quickly,
    // the handler must already have a row to correlate against — subscribing
    // first leaves a window where an early callback is silently dropped.
    createSession(threadId, kind);

    // Subscribing (network call) and building the QR (local, CPU-only) don't
    // depend on each other, so they run concurrently rather than back to back.
    // No QR to build when NDI pushed the request directly (no proofRequestURL).
    const [subscribed, qr] = await Promise.all([
      trySubscribe(threadId),
      proof.proofRequestURL ? buildQrMatrix(proof.proofRequestURL) : Promise.resolve(null),
    ]);

    // Deliberately does not echo the access token or client credentials.
    return NextResponse.json({
      threadId,
      // "push" only when NDI's own response omitted a URL — see createProofRequest.
      mode: proof.proofRequestURL ? "qr" : "push",
      proofRequestURL: proof.proofRequestURL,
      deepLinkURL: proof.deepLinkURL,
      qr,
      /** Lets the popup skip polling when nothing can ever resolve it. */
      subscribed,
    });
  } catch (error) {
    if (error instanceof NdiError) {
      // Log the upstream detail server-side; don't leak it to the browser.
      console.error("[ndi] %s — %s", error.message, error.detail ?? "no detail");
      // Preserve 504 (upstream timed out); everything else upstream is a bad
      // gateway from the browser's point of view, not the caller's fault.
      return NextResponse.json(
        { error: error.message },
        { status: error.status === 504 ? 504 : 502 },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ndi] proof-request failed —", message);
    // A missing env var surfaces here; the message is safe (no values in it).
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
