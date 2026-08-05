import { NextResponse } from "next/server";
import {
  NdiError,
  createCheckInProofRequest,
  subscribeWebhook,
} from "@/lib/ndi/client";
import { isWebhookConfigured } from "@/lib/ndi/config";
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

export async function POST() {
  try {
    const proof = await createCheckInProofRequest();
    const threadId = proof.proofRequestThreadId;

    // Create the session BEFORE subscribing. If NDI calls back very quickly,
    // the handler must already have a row to correlate against — subscribing
    // first leaves a window where an early callback is silently dropped.
    createSession(threadId);

    // Subscribing (network call) and building the QR (local, CPU-only) don't
    // depend on each other, so they run concurrently rather than back to back.
    const [subscribed, qr] = await Promise.all([
      trySubscribe(threadId),
      buildQrMatrix(proof.proofRequestURL),
    ]);

    // Deliberately does not echo the access token or client credentials.
    return NextResponse.json({
      threadId,
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
