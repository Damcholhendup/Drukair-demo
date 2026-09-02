import "server-only";

import { server } from "./config";

export type IssueCredentialResult = {
  /** Use this for generating a QR — only present when a fresh scan is needed. */
  credInviteURL: string;
  deepLinkURL: string;
  /** Store this to later revoke/suspend the issued credential. */
  revocationId?: string;
  issueCredThreadId: string;
};

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */

/** Fail fast rather than letting a stalled upstream hold the request open. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * NDI staging drops pooled keep-alive connections, which surfaces as a hung
 * request or "connection closed" rather than an HTTP error. Observed directly:
 * three identical calls gave 60s hang / 588ms success / 60s hang.
 *
 * So: bound every attempt with a timeout and retry transport-level failures.
 * HTTP responses — including 4xx and 5xx — are returned untouched, because a
 * real rejection should not be retried.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      lastError = error;
      const reason =
        error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.warn(
        "[ndi] %s attempt %d/%d failed — %s",
        new URL(url).pathname,
        attempt,
        attempts,
        reason,
      );
      // Brief linear backoff; the failure mode is a stale socket, not load.
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }

  throw new NdiError(
    "Bhutan NDI did not respond. Its staging environment intermittently drops connections — please try again.",
    504,
    lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : undefined,
  );
}

/* -------------------------------------------------------------------------- */
/* Access token                                                               */
/* -------------------------------------------------------------------------- */

type CachedToken = { token: string; expiresAt: number };

/**
 * Cached on `globalThis`, not a plain module-level `let`. Next.js dev
 * (Turbopack) can end up giving different routes separate instances of this
 * module after an edit-triggered recompile (confirmed with the session store
 * in lib/ndi/sessions.ts, which hit the same issue) — a plain singleton would
 * then silently re-authenticate per route instead of sharing the 24h token.
 * Wrong-but-safe here rather than wrong-and-broken: worst case is an extra
 * auth call, never a stale or invalid token being reused past its margin.
 */
const globalForNdi = globalThis as unknown as { __ndiToken?: CachedToken | null };

/** Refresh this many ms before actual expiry, so a token can't die mid-flight. */
const EXPIRY_MARGIN_MS = 60_000;

/** Pulls `exp` out of a JWT without verifying it. We are the audience, not the
 *  validator — this is only used to decide when to re-fetch. */
function expiryFromJwt(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string> {
  const cached = globalForNdi.__ndiToken;
  if (cached && Date.now() < cached.expiresAt - EXPIRY_MARGIN_MS) {
    return cached.token;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // The documented call needs no bearer; send one only if configured.
  if (server.authBearer) headers.Authorization = `Bearer ${server.authBearer}`;

  const res = await fetchWithRetry(
    `${server.authBaseUrl}/authentication/v1/authenticate`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        client_id: server.clientId,
        client_secret: server.clientSecret,
        grant_type: "client_credentials",
      }),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    throw new NdiError(
      `NDI authentication failed (${res.status})`,
      res.status,
      text.slice(0, 500),
    );
  }

  // The response shape is undocumented, so accept the plausible spellings
  // rather than guessing one and breaking on the first call.
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new NdiError("NDI authentication returned non-JSON", 502, text.slice(0, 500));
  }

  const data = (body.data ?? body) as Record<string, unknown>;
  const token =
    (data.access_token as string) ??
    (data.accessToken as string) ??
    (data.token as string);

  if (!token) {
    throw new NdiError(
      "NDI authentication response contained no access token",
      502,
      JSON.stringify(body).slice(0, 500),
    );
  }

  const expiresIn = Number(data.expires_in ?? data.expiresIn);
  const expiresAt = Number.isFinite(expiresIn)
    ? Date.now() + expiresIn * 1000
    : (expiryFromJwt(token) ?? Date.now() + 15 * 60_000);

  globalForNdi.__ndiToken = { token, expiresAt };
  return token;
}

/* -------------------------------------------------------------------------- */
/* Proof request                                                              */
/* -------------------------------------------------------------------------- */

export type ProofRequest = {
  proofRequestName: string;
  proofRequestThreadId: string;
  /**
   * Encode this as the QR code — absent when NDI pushed the request directly
   * to an existing relationship instead of minting a fresh invitation (see
   * `targetRelationshipDid` below).
   */
  proofRequestURL?: string;
  /** Use this for the "Open Bhutan NDI wallet" deep link. Absent in the same
   *  case as `proofRequestURL`. */
  deepLinkURL?: string;
};

export class NdiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "NdiError";
  }
}

/**
 * Creates a proof request for either stage of the flow — which attributes are
 * asked for comes entirely from `opts`, built from `ticketProofRequest` or
 * `boardingProofRequest` in lib/ndi/config.ts.
 *
 * Attribute names are matched literally by NDI, so e.g. "ID Number" must keep
 * its space and capitalisation.
 */
export async function createProofRequest(opts: {
  proofName: string;
  purpose: string;
  attributes: readonly { name: string; schemaUrl: () => string }[];
  /**
   * When set, asks NDI to deliver the proof request directly to this
   * relationship instead of returning a fresh invitation to scan.
   *
   * See `boarding.noRescan` in config.ts for how this was confirmed live
   * against staging: NDI genuinely validates this field (a bad value 400s,
   * a well-formed-but-unknown UUID gets further, into a 500). This function
   * still reports "push" mode purely from the response shape (no
   * proofRequestURL), never from whether this was requested, so a real
   * failure surfaces as an error rather than a silently wrong QR/push choice.
   */
  targetRelationshipDid?: string | null;
}): Promise<ProofRequest> {
  const token = await getAccessToken();

  const res = await fetchWithRetry(`${server.clientBaseUrl}/verifier/v1/proof-request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      accept: "*/*",
    },
    body: JSON.stringify({
      proofName: opts.proofName,
      purpose: opts.purpose,
      proofAttributes: opts.attributes.map((attr) => ({
        name: attr.name,
        restrictions: [{ schema_name: attr.schemaUrl() }],
      })),
      // Mirrors issueCredential's forRelationship — see the caveat above.
      ...(opts.targetRelationshipDid
        ? { forRelationship: opts.targetRelationshipDid }
        : {}),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new NdiError(
      `NDI proof request failed (${res.status})`,
      res.status,
      text.slice(0, 500),
    );
  }

  let body: { data?: Partial<ProofRequest> };
  try {
    body = JSON.parse(text) as { data?: Partial<ProofRequest> };
  } catch {
    throw new NdiError("NDI proof request returned non-JSON", 502, text.slice(0, 500));
  }

  const data = body.data;
  if (!data?.proofRequestThreadId) {
    throw new NdiError(
      "NDI proof request response was missing proofRequestThreadId",
      502,
      JSON.stringify(body).slice(0, 500),
    );
  }

  return {
    proofRequestName: data.proofRequestName ?? opts.proofName,
    proofRequestThreadId: data.proofRequestThreadId,
    proofRequestURL: data.proofRequestURL || undefined,
    deepLinkURL: data.deepLinkURL || undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Issuer service                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Issues a credential to a holder.
 *
 * `forRelationship`, when set to an already-established relationshipDid (the
 * one returned alongside a validated proof), lets NDI push the credential
 * offer straight to that connection — the holder never has to scan a second
 * QR. Left blank, NDI mints a fresh relationship and returns a new
 * `credInviteURL` / `deepLinkURL` for that instead.
 *
 * Wire field is `forRelationship` (capital R) — confirmed against a real
 * issuance payload for this schema. An earlier version of this code sent
 * `forrelationship` (all lowercase), matching an earlier example. That may be
 * the actual reason every prior issuance opened a fresh relationship even when
 * a relationshipDid was passed: NDI likely ignored the misnamed field rather
 * than erroring, which reads identically to "the relationship wasn't found".
 *

 * NOT retried on transport failure (attempts = 1), unlike every other call
 * here. A timeout or dropped connection tells us nothing about whether NDI
 * already processed the request — so retrying risks issuing the credential
 * twice, and the holder ending up with two in their wallet. Since retrying is
 * unsafe and issuing is a real side effect, one attempt then surface the
 * failure is the correct trade: a missed issuance can be retried deliberately,
 * a duplicate one cannot be un-issued.
 */
export async function issueCredential(params: {
  /** Some schemas expect specific attributes as JSON numbers rather than
   *  strings — see lib/ndi/records.ts's `toIssuancePayload`, which is what
   *  should build this rather than passing raw string values through. */
  credentialData: Record<string, string | number>;
  schemaId: string;
  holderDID: string;
  forRelationship?: string;
}): Promise<IssueCredentialResult> {
  const token = await getAccessToken();

  const res = await fetchWithRetry(
    `${server.clientBaseUrl}/issuer/v1/issue-credential`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        accept: "*/*",
      },
      body: JSON.stringify({
        credentialData: params.credentialData,
        schemaId: params.schemaId,
        holderDID: params.holderDID,
        // Field name and casing exactly as specified for this integration.
        forRelationship: params.forRelationship ?? "",
      }),
    },
    1,
  );

  const text = await res.text();
  if (!res.ok) {
    throw new NdiError(
      `NDI issue-credential failed (${res.status})`,
      res.status,
      text.slice(0, 500),
    );
  }

  let body: { data?: Partial<IssueCredentialResult> };
  try {
    body = JSON.parse(text) as { data?: Partial<IssueCredentialResult> };
  } catch {
    throw new NdiError(
      "NDI issue-credential returned non-JSON",
      502,
      text.slice(0, 500),
    );
  }

  const data = body.data;
  if (!data?.issueCredThreadId) {
    throw new NdiError(
      "NDI issue-credential response was missing issueCredThreadId",
      502,
      JSON.stringify(body).slice(0, 500),
    );
  }

  return {
    credInviteURL: data.credInviteURL ?? "",
    deepLinkURL: data.deepLinkURL ?? "",
    revocationId: data.revocationId,
    issueCredThreadId: data.issueCredThreadId,
  };
}

/* -------------------------------------------------------------------------- */
/* Webhook service                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Registration is done once, by hand, against the NDI dashboard/API — not by
 * this app. `NDI_WEBHOOK_ID` and `NDI_WEBHOOK_AUTH_TOKEN` in .env.local must
 * match whatever was used at registration time (OAuth2 "v2": a fixed token NDI
 * echoes back in the Authorization header, which /webhook verifies).
 */

/** Points the already-registered webhook at one proof/credential thread. */
export async function subscribeWebhook(threadId: string): Promise<void> {
  const token = await getAccessToken();

  const res = await fetchWithRetry(`${server.clientBaseUrl}/webhook/v1/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      accept: "*/*",
    },
    body: JSON.stringify({ webhookId: server.webhookId, threadId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new NdiError(
      `Webhook subscribe failed (${res.status})`,
      res.status,
      text.slice(0, 500),
    );
  }
}

/**
 * Best-effort unsubscribe once a thread is finished.
 *
 * Never throws: the check-in has already succeeded by this point, and the
 * subscription lapses with the thread anyway. Failing here must not turn a
 * completed check-in into an error.
 */
export async function unsubscribeWebhook(threadId: string): Promise<void> {
  try {
    const token = await getAccessToken();
    const res = await fetchWithRetry(
      `${server.clientBaseUrl}/webhook/v1/unsubscribe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          accept: "*/*",
        },
        body: JSON.stringify({ webhookId: server.webhookId, threadId }),
      },
      2,
    );
    if (!res.ok) {
      console.warn("[ndi] unsubscribe returned %d for thread %s", res.status, threadId);
    }
  } catch (error) {
    console.warn(
      "[ndi] unsubscribe failed for thread %s — %s",
      threadId,
      error instanceof Error ? error.message : String(error),
    );
  }
}
