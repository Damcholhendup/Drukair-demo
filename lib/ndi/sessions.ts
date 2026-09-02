import "server-only";

import { PROOF_TTL_MS, SESSION_TTL_MS } from "./config";

export type SessionStatus =
  | "PENDING"
  | "VERIFIED"
  | "CONSUMED"
  | "REJECTED"
  | "FAILED"
  /** Proof validated, but the disclosed CID matched no record in lib/ndi/records.ts. */
  | "NOT_REGISTERED"
  /** Proof validated and the CID is registered, but this is a `boarding`
   *  session and that CID has no ticket VC issued yet. */
  | "NOT_TICKETED";

/** Which stage/flow this session belongs to — decides how the webhook
 *  interprets the proof and what it issues. See lib/ndi/config.ts.
 *
 *   ticket   — online flow, stage 1: proves CID, issues the ticket VC.
 *   boarding — online flow, stage 2: proves the ticket, issues the boarding
 *              pass VC. Refused unless that CID's ticket was already issued.
 *   walkin   — walk-in flow: proves CID, issues the boarding pass VC directly.
 *              Same mechanics as `ticket`, just issuing the other schema and
 *              skipping the ticket entirely — there is no earlier stage to gate on.
 */
export type SessionKind = "ticket" | "boarding" | "walkin";

/**
 * Progress of the follow-on credential issuance, tracked separately from
 * `status` above because issuing is a second, slower NDI call made *after* the
 * proof itself is already verified — the two can't share one state machine.
 */
export type IssuanceState =
  | { status: "issuing" }
  | {
      status: "issued";
      /** Only set when NDI had to mint a fresh relationship — nothing to show
       *  when `forrelationship` succeeded, since no new scan is needed. */
      credInviteURL?: string;
      deepLinkURL?: string;
      issueCredThreadId: string;
      revocationId?: string;
    }
  | { status: "failed"; reason: string };

export type CheckInSession = {
  threadId: string;
  kind: SessionKind;
  status: SessionStatus;
  createdAt: number;
  resolvedAt?: number;
  /** Attributes the wallet disclosed, keyed by the name we requested. */
  attributes?: Record<string, string>;
  /** The holder DID — this is what a boarding-pass VC gets issued to. */
  holderDid?: string | null;
  relationshipDid?: string | null;
  /** Set when status is FAILED, for the UI to explain itself. */
  reason?: string;
  issuance?: IssuanceState;
};

/**
 * In-process session store.
 *
 * Node runs one turn of the event loop at a time, so the check-and-set in
 * `resolveIfPending` is genuinely atomic here — no transaction needed. That is
 * the whole reason this is safe against NDI's webhook retries.
 *
 * Deliberately not a database yet: the storage engine hasn't been chosen. The
 * surface below is the seam — swap the Map for Prisma and `resolveIfPending`
 * becomes `updateMany({ where: { threadId, status: 'PENDING' } })`, which has
 * the same "only the winner proceeds" semantics. Nothing else has to change.
 *
 * Consequences worth knowing while it stays in memory:
 *   - a server restart drops in-flight check-ins (they'd expire in ~5 min anyway)
 *   - it assumes a single process; two instances would not see each other's rows
 *
 * Pinned to `globalThis` rather than a plain module-level `const`. Next.js dev
 * (Turbopack) compiles route handlers on demand, per route — if one route
 * recompiles after an edit and a sibling route doesn't, each can end up with
 * its own separate instance of this module, so a plain singleton silently stops
 * being shared (reproduced directly: proof-request and status returned
 * different Maps after only the status/webhook routes were edited). Stashing
 * it on `globalThis` is the standard fix for this — the same reason Next.js +
 * Prisma examples cache the client on `globalThis` in dev.
 */
const globalForNdi = globalThis as unknown as {
  __ndiSessions?: Map<string, CheckInSession>;
  __ndiPurgeTimer?: NodeJS.Timeout;
};

const sessions = globalForNdi.__ndiSessions ?? new Map<string, CheckInSession>();
globalForNdi.__ndiSessions = sessions;

/** Purges old rows, because they hold disclosed PII. Idempotent. */
function purge() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  let removed = 0;
  for (const [threadId, session] of sessions) {
    if (session.createdAt < cutoff) {
      sessions.delete(threadId);
      removed++;
    }
  }
  if (removed > 0) console.log("[ndi] purged %d expired session(s)", removed);
}

function ensurePurgeTimer() {
  if (globalForNdi.__ndiPurgeTimer) return;
  const timer = setInterval(purge, Math.min(SESSION_TTL_MS, 600_000));
  // Never hold the process open just for housekeeping.
  timer.unref?.();
  globalForNdi.__ndiPurgeTimer = timer;
}

export function createSession(threadId: string, kind: SessionKind): CheckInSession {
  ensurePurgeTimer();
  const session: CheckInSession = {
    threadId,
    kind,
    status: "PENDING",
    createdAt: Date.now(),
  };
  sessions.set(threadId, session);
  return session;
}

export function getSession(threadId: string): CheckInSession | undefined {
  return sessions.get(threadId);
}

/** True once the session is past its proof window. Deliberately not written to
 *  the row: leaving it PENDING lets a late-but-genuine webhook still resolve it. */
export function isExpired(session: CheckInSession): boolean {
  return session.status === "PENDING" && Date.now() - session.createdAt > PROOF_TTL_MS;
}

/**
 * Moves a session from PENDING to a terminal state, returning true **only** for
 * the caller that actually made the transition.
 *
 * NDI retries a webhook until it gets a 202, so the same `thid` can arrive
 * several times, possibly overlapping. Gating every side effect on this return
 * value is what stops us issuing two boarding passes for one check-in.
 */
export function resolveIfPending(
  threadId: string,
  status: Exclude<SessionStatus, "PENDING" | "CONSUMED">,
  patch?: Partial<Pick<CheckInSession, "attributes" | "holderDid" | "relationshipDid" | "reason">>,
): boolean {
  const session = sessions.get(threadId);
  if (!session || session.status !== "PENDING") return false;

  sessions.set(threadId, {
    ...session,
    ...patch,
    status,
    resolvedAt: Date.now(),
  });
  return true;
}

/**
 * Atomically claims a VERIFIED session, flipping it to CONSUMED.
 *
 * Without this, a threadId would behave like a bearer credential: anyone
 * replaying it to the status endpoint could re-read the disclosed attributes for
 * as long as the session lived.
 */
export function consumeVerified(threadId: string): CheckInSession | null {
  const session = sessions.get(threadId);
  if (!session || session.status !== "VERIFIED") return null;
  const consumed: CheckInSession = { ...session, status: "CONSUMED" };
  sessions.set(threadId, consumed);
  return session;
}

/**
 * Records issuance progress against an already-resolved session.
 *
 * No compare-and-swap here, unlike `resolveIfPending` — this is only ever
 * called from the single execution path that already won that gate (see
 * app/webhook/route.ts), so there is no concurrent writer to race against.
 * A no-op if the session was purged mid-issuance.
 */
export function setIssuance(threadId: string, issuance: IssuanceState): void {
  const session = sessions.get(threadId);
  if (!session) return;
  sessions.set(threadId, { ...session, issuance });
}

/** Test/diagnostic helper. Not used by request paths. */
export function _sessionCount(): number {
  return sessions.size;
}
