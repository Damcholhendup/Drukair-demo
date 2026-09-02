/**
 * Bhutan NDI integration config.
 *
 * Everything in `server` is read on the server only — never import it into a
 * client component. `brand` is safe to use anywhere.
 */

/** Reads a required env var, failing loudly rather than sending an empty
 *  client_secret to NDI and getting an opaque 401 back. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const server = {
  get clientId() {
    return required("NDI_CLIENT_ID");
  },
  get clientSecret() {
    return required("NDI_CLIENT_SECRET");
  },
  get authBaseUrl() {
    return process.env.NDI_AUTH_BASE_URL ?? "https://staging.bhutanndi.com";
  },
  get clientBaseUrl() {
    return process.env.NDI_CLIENT_BASE_URL ?? "https://demo-client.bhutanndi.com";
  },
  get foundationalSchemaUrl() {
    return (
      process.env.NDI_FOUNDATIONAL_SCHEMA_URL ??
      "https://dev-schema.ngotag.com/schemas/c7952a0a-e9b5-4a4b-a714-1e5d0a1ae076"
    );
  },
  /** The Ticket VC — issued once the ticket step succeeds. */
  get issuanceSchemaUrl() {
    return (
      process.env.NDI_ISSUANCE_SCHEMA_URL ||
      "https://dev-schema.ngotag.com/schemas/9e3c9c24-5b19-49b0-9af9-d44770b70124"
    );
  },
  /** The Boarding Pass VC — issued once the boarding-pass step (online flow)
   *  or the single walk-in step succeeds. */
  get boardingSchemaUrl() {
    return (
      process.env.NDI_BOARDING_SCHEMA_URL ||
      "https://dev-schema.ngotag.com/schemas/8aef1837-98d6-437b-b682-53866d4e0e27"
    );
  },
  /** Optional; see .env.example. */
  get authBearer() {
    return process.env.NDI_AUTH_BEARER ?? "";
  },

  /* ---- Webhook ----
   *
   * Registration itself happens once, by hand, directly against NDI (v2: a
   * fixed token NDI echoes back to us). This app only ever *uses* the result:
   * subscribing/unsubscribing a thread, and verifying inbound callbacks against
   * the same token. Nothing here registers or updates the webhook.
   */

  /** The webhookId that was registered with NDI. */
  get webhookId() {
    return required("NDI_WEBHOOK_ID");
  },
  /**
   * The fixed token NDI sends back in the Authorization header (OAuth2 v2) —
   * must be exactly what was used at registration. This is the ONLY thing
   * stopping a forged "proof validated" POST, so in production it must be a
   * strong random secret.
   */
  get webhookAuthToken() {
    return required("NDI_WEBHOOK_AUTH_TOKEN");
  },
} as const;

/**
 * True only when both webhook settings are present.
 *
 * The QR flow is useful on its own, so a missing webhook config must not break
 * it: callers skip subscribing and warn instead of throwing. The check-in
 * simply stays pending, which is the honest outcome — nothing can resolve it.
 */
export function isWebhookConfigured(): boolean {
  return Boolean(process.env.NDI_WEBHOOK_ID && process.env.NDI_WEBHOOK_AUTH_TOKEN);
}

/**
 * Boarding pass is the second stage: prove a ticket number (placeholder: CID
 * again, until a real ticket-VC schema exists), then issue a boarding pass.
 */
export const boarding = {
  /**
   * When true, the boarding-pass proof request targets the relationship_did
   * already established at the ticket step instead of minting a fresh
   * invitation — the holder is never asked to scan a second QR.
   *
   * Confirmed live against NDI staging that `verifier/v1/proof-request` DOES
   * read and validate this field (sent as `forRelationship`, matching
   * issuer/v1/issue-credential): a non-UUID value 400s with "connectionId
   * must be a UUID", and a syntactically valid but nonexistent UUID gets past
   * that into a 500 "Rpc Exception" trying to resolve it — the same two-layer
   * failure shape `issueCredential` hits with a fake relationship_did. That's
   * strong evidence a REAL relationship_did (itself a UUID, e.g. one already
   * seen in a webhook payload) succeeds — just not proven with an actual push
   * delivered to a wallet yet. Safe to enable regardless: `createProofRequest`
   * only claims "push" mode when NDI's response omits a proofRequestURL, so a
   * failure here would surface as an error, never a silent bad state.
   */
  get noRescan() {
    return process.env.NDI_BOARDING_NO_RESCAN === "true";
  },
} as const;

/**
 * Which UI structure presents the two NDI stages. Read on the client too
 * (journey layout depends on it), so this is the one flow setting that's
 * NEXT_PUBLIC — everything else that's actually sensitive or server-decided
 * (schemas, no-rescan) stays server-only.
 *
 *   "separate"   — two distinct triggers in the journey (check-in, then a
 *                  later boarding-gate step), each opening its own popup.
 *   "continuous" — one trigger runs both stages back-to-back in one popup.
 */
export function flowUiMode(): "separate" | "continuous" {
  return process.env.NEXT_PUBLIC_NDI_FLOW_UI_MODE === "continuous"
    ? "continuous"
    : "separate";
}

/**
 * How long a started check-in stays valid. The NDI proof itself lapses in about
 * five minutes, so there is no point holding a session much longer.
 */
export const PROOF_TTL_MS = Math.max(
  60_000,
  Number(process.env.NDI_PROOF_TTL_MS ?? 300_000),
);

/** Sessions are purged after this, because they hold disclosed PII. */
export const SESSION_TTL_MS = Math.max(
  PROOF_TTL_MS,
  Number(process.env.NDI_SESSION_TTL_MS ?? 3_600_000),
);

/* -------------------------------------------------------------------------- */
/* The swappable bit                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What we ask the passenger to present at the TICKET step (Step 1).
 *
 * This is the single place to change when the use case firms up: add or remove
 * attributes here and the proof request, the webhook reader and the status
 * response all follow automatically. Nothing else hard-codes an attribute name.
 *
 * `name` must match the schema attribute exactly — NDI matches literally, so
 * "ID Number" keeps its space and capitalisation.
 */
export const ticketProofRequest = {
  proofName: "G2C",
  purpose: "login",
  attributes: [
    { name: "ID Number", schemaUrl: () => server.foundationalSchemaUrl },
    // Add more as the use case grows, e.g.
    // { name: "Full Name", schemaUrl: () => server.foundationalSchemaUrl },
  ],
  /**
   * The attribute that identifies the passenger. A validated proof that fails to
   * disclose this is treated as a configuration error, not an unknown traveller.
   */
  subjectAttribute: "ID Number",
} as const;

/**
 * What we ask the passenger to present in the WALK-IN flow: a CID proof,
 * identical in shape to the ticket stage's — the walk-in flow just issues the
 * boarding-pass credential straight off it, with no ticket VC in between. Its
 * own export (rather than reusing `ticketProofRequest`) so it can be tuned
 * independently later without touching the online flow.
 */
export const walkinProofRequest = {
  proofName: "G2C",
  purpose: "login",
  attributes: [
    { name: "ID Number", schemaUrl: () => server.foundationalSchemaUrl },
  ],
  subjectAttribute: "ID Number",
} as const;

/**
 * What we ask the passenger to present at the BOARDING-PASS step (Step 2):
 * their Ticket Number, restricted to the Ticket VC schema itself — so this is
 * only satisfiable by presenting the actual credential issued at step 1, not
 * just re-disclosing the CID. The lookup this feeds (see
 * `findRecordByTicketNumber` in lib/ndi/records.ts) matches on that value,
 * not on CID, which is what makes this genuinely "prove your ticket" rather
 * than "prove your identity again".
 */
export const boardingProofRequest = {
  proofName: "G2C",
  // NDI validates `purpose` against a fixed enum — confirmed directly against
  // staging: login | ekyc | ekyc_update | otp. "boarding" 400s. `login` is the
  // closest fit until a real ticket-number verification purpose exists.
  purpose: "login",
  attributes: [{ name: "Ticket Number", schemaUrl: () => server.issuanceSchemaUrl }],
  subjectAttribute: "Ticket Number",
} as const;

/**
 * What we ISSUE once the passenger's proof matches a record in
 * lib/ndi/records.ts. `credentialData` itself isn't here — it's per-passenger,
 * so it comes from the matched record (`ticketData` / `boardingData`) — only
 * the schema is fixed per deployment.
 */
export const issuance = {
  ticket: { schemaId: () => server.issuanceSchemaUrl },
  boarding: { schemaId: () => server.boardingSchemaUrl },
} as const;

/**
 * Brand values fixed by the Bhutan NDI UI Specifications. These are mandated,
 * not preferences — they intentionally sit outside the Drukair theme tokens so
 * the two palettes never bleed into one another.
 */
export const brand = {
  green: "#5AC994",
  teal: "#124143",
  popupBg: "#F8F8F8",
  muted: "#A1A0A0",
  white: "#FFFFFF",
} as const;

/**
 * Copy mandated by the spec. Do not paraphrase these — the wording is part of
 * the compliance requirement.
 *
 * Where the spec's written language lists (Passwordless Login / Issuance / eKYC
 * sections) disagree with the casing in the reference popup screenshot, the
 * written list wins, since it is stated as a requirement: "with the text as
 * below". Layout and structure follow the screenshot.
 */
export const copy = {
  /** Our popup carries the deep-link button, so the spec's deep-link title
   *  applies: "using scan causes confusion to users". */
  titlePrefix: "Login with ",
  titleBrand: "Bhutan NDI",
  titleSuffix: " Wallet",
  openWallet: "Open Bhutan NDI wallet",
  or: "OR",
  /** The reference popup numbers these as two discrete steps. */
  step1: "Open Bhutan NDI Wallet on your phone",
  step2Before: "Tap the Scan button",
  step2After: "located on the menu bar and scan the QR code",
  watchVideo: "Watch Video Guide",
  downloadPrompt: "Don't have the Bhutan NDI Wallet?",
  downloadCta: "Download Now!",
  supportHeader: "Get Support",
  loginButton: "Login with Bhutan NDI",
  tollFree: "1199",
} as const;

/**
 * Assets and links. The ones still empty were "attached to the email" and are
 * not in this repo yet; each consumer renders only when its value is present,
 * so nothing fabricated ever ships.
 *
 * TODO(ndi): supply these to finish the popup.
 *   - logoSrc:      official Bhutan NDI logo (SVG preferred), place in /public
 *   - scanIconSrc:  the green scan icon used in the NDI app
 *   - videoGuideUrl: the system tutorial on the NDI YouTube channel, or the
 *                    main channel if no system-specific tutorial exists
 *   - playBadgeSrc / appBadgeSrc: the official store badges. These are
 *                    trademarked artwork, so they are not recreated here —
 *                    drop the real assets in and they render.
 */
export const assets = {
  logoSrc: "" as string,
  scanIconSrc: "" as string,
  videoGuideUrl: "" as string,
  /** Taken from the reference popup in the UI spec document. */
  supportEmail: "ndifeedback@bhutanndi.bt" as string,
  playStoreUrl: "" as string,
  appStoreUrl: "" as string,
  playBadgeSrc: "" as string,
  appBadgeSrc: "" as string,
} as const;
