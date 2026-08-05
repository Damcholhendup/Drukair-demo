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
  /** The credential we ISSUE once check-in succeeds. Defaults to the bank demo
   *  schema used to prove out the issuance mechanics before a real one exists. */
  get issuanceSchemaUrl() {
    return (
      process.env.NDI_ISSUANCE_SCHEMA_URL ??
      "https://dev-schema.ngotag.com/schemas/61179c5f-44f4-4380-ae37-ff3b1f093288"
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
 * What we ask the passenger to present at check-in.
 *
 * This is the single place to change when the use case firms up: add or remove
 * attributes here and the proof request, the webhook reader and the status
 * response all follow automatically. Nothing else hard-codes an attribute name.
 *
 * `name` must match the schema attribute exactly — NDI matches literally, so
 * "ID Number" keeps its space and capitalisation.
 */
export const proofRequest = {
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
 * What we ISSUE once the passenger's proof matches a record in
 * lib/ndi/records.ts. `credentialData` itself isn't here — it's per-passenger,
 * so it comes from the matched record — only the schema is fixed per deployment.
 */
export const issuance = {
  schemaId: () => server.issuanceSchemaUrl,
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
