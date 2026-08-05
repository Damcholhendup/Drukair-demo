# Drukair — Passenger Onboarding (concept)

A single-page website concept for Drukair walking a passenger through the
process of getting on board the aircraft, from the check-in counter to the
cabin seat — with a **working Bhutan NDI integration** behind the check-in step:
the passenger proves their identity from their NDI wallet, and a credential is
issued back to it.

Not affiliated with, or endorsed by, Drukair. The dragon mark is an original
abstraction (wing sweep + thunder bolt), not the airline's real logo.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (`@theme` tokens in `app/globals.css`) |
| Animation | Framer Motion 12 |
| Fonts | Geist Sans + Geist Mono, plus Inter for the NDI popup |
| Identity | Bhutan NDI — verifier, issuer and webhook services |

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the values — see below
npm run dev                    # http://localhost:3000
```

```bash
npm run build   # production build
npm run lint    # eslint
npx tsc --noEmit
```

## Environment

Copy `.env.example` to `.env.local` and fill it in. **`.env.local` is gitignored;
`.env.example` is committed, so never put real values there.** Everything is
read server-side only — nothing is `NEXT_PUBLIC_*`, so no credential reaches the
browser.

| Variable | Purpose |
|---|---|
| `NDI_CLIENT_ID` / `NDI_CLIENT_SECRET` | OAuth2 client credentials from the NDI team |
| `NDI_AUTH_BASE_URL` | Auth host (`staging.bhutanndi.com`) |
| `NDI_CLIENT_BASE_URL` | Service host (`demo-client.bhutanndi.com`) — note it differs from auth |
| `NDI_FOUNDATIONAL_SCHEMA_URL` | Schema the holder **presents** at check-in |
| `NDI_ISSUANCE_SCHEMA_URL` | Schema of the credential we **issue** |
| `NDI_WEBHOOK_ID` | The webhookId registered with NDI |
| `NDI_WEBHOOK_AUTH_TOKEN` | Fixed token NDI echoes back; must match registration exactly |
| `NDI_AUTH_BEARER` | Optional. Only if your gateway wants a bearer on `/authenticate` |

### Webhook registration is manual

Registering the callback endpoint is a **one-time step done by hand against NDI**
(OAuth2 "v2": a fixed token NDI returns in the `Authorization` header). This app
never registers or updates it — it only subscribes threads and verifies inbound
callbacks. Register `https://<your-host>/webhook`, then put the same
`webhookId` and token in `.env.local`.

Without those two values the app still works: the QR renders and is scannable,
subscribing is skipped with a warning, and the check-in simply stays `pending` —
which is honest, since nothing could resolve it.

## The NDI flow

```
Click "Login with Bhutan NDI"
  POST /api/ndi/proof-request
    → authenticate (token cached ~24h)
    → verifier: create proof request → proofRequestURL, threadId
    → concurrently: subscribe the thread  +  build the QR matrix
    ← { threadId, proofRequestURL, deepLinkURL, qr, subscribed }

Holder shares the proof
  POST /webhook
    → constant-time check of Authorization against NDI_WEBHOOK_AUTH_TOKEN
    → correlate by thid; atomic PENDING → terminal (idempotent under retries)
    → look up the disclosed ID Number in the seed store
    → 202 to NDI immediately
    → in the background: issue the credential to holder_did, passing
      relationship_did as `forrelationship` so the wallet needs no second scan

GET /api/ndi/status/:threadId
  → polled by the popup; disclosed attributes delivered exactly once
    (VERIFIED → CONSUMED), issuance progress reported until it settles
```

### Changing what is asked for and issued

Both live in `lib/ndi/config.ts`:

- `proofRequest.attributes` — what the holder must present. Attribute names are
  matched **literally** by NDI, so `"ID Number"` keeps its space and capitals.
- `proofRequest.subjectAttribute` — the attribute used to identify the
  passenger. A validated proof that omits it is treated as a configuration
  error, not an unknown traveller.
- `issuance.schemaId()` — the credential being issued.

Per-passenger credential data comes from `lib/ndi/records.ts`, keyed by the
disclosed subject attribute.

### Demo data panel

The section at the bottom of the page registers which ID Numbers may receive a
credential. To use your own wallet: share a proof once, find your real ID Number
in the `[ndi-webhook] RAW body` server log, then add it with a CIF and Bank Name.

## Deployment

> **This app must run as a long-lived Node process. Do not deploy it to a
> serverless or edge runtime** (Vercel functions, Cloudflare Workers, Netlify,
> Lambda). It would appear to work and then silently fail to issue credentials.

Four hard dependencies on a persistent process with stable memory:

1. Issuance is started **after** the webhook response is sent, so the 202 is not
   delayed. Serverless freezes the instance at response time, so that work would
   never run.
2. The session store is in memory — `/api/ndi/proof-request` writes it and
   `/webhook` reads it. Separate invocations do not share memory.
3. The record store is in memory, so seeded CIDs would be invisible to the
   webhook.
4. A `setInterval` purges expired sessions (they hold disclosed PII).

Consequences: run **exactly one instance** (two would split the in-memory
stores), and expect seeded CIDs and in-flight check-ins to reset on every
deploy or restart.

### Railway

```
Dockerfile        multi-stage; runs `node server.js` from Next's standalone output
.dockerignore     keeps node_modules, .next and every .env out of the image
```

1. Point Railway at this repo — it will use the `Dockerfile`.
2. Set every variable from the table above in Railway's service variables.
   Do **not** rely on `.env.local`; it is gitignored and not in the image.
3. **Region: Singapore.** NDI's endpoints are in `ap-southeast-1`, so a US
   region adds a round trip to the call the user waits on behind the QR.
4. **Replicas: 1.**
5. Take the generated domain and register `https://<domain>/webhook` with NDI,
   then set `NDI_WEBHOOK_ID` / `NDI_WEBHOOK_AUTH_TOKEN` to match.

Because the webhook URL is registered manually, **re-register whenever the
public URL changes** — attaching a custom domain early avoids doing this twice.

Any container host works the same way (Fly.io `sin`, DigitalOcean SGP1, a VPS).

## Layout

```
app/
  layout.tsx                       fonts, metadata, page shell
  page.tsx                         section composition
  globals.css                      design tokens, keyframes, utilities
  webhook/route.ts                 NDI callback target
  api/ndi/proof-request/route.ts   start a check-in
  api/ndi/status/[threadId]/       polled by the popup
  api/records/route.ts             demo seed CRUD
lib/ndi/
  config.ts                        env, brand, mandated copy, proof + issuance
  client.ts                        auth, verifier, issuer, webhook sub/unsub
  sessions.ts                      check-in state machine (in memory)
  records.ts                       CID → credential data (in memory)
  attrs.ts                         readers for disclosed attributes
  qr.ts                            QR module matrix
components/
  Brand.tsx                        DragonMark, Wordmark, PlaneGlyph, PrayerRibbon
  SiteNav.tsx                      transparent over the video, white once scrolled
  Hero.tsx                         full-bleed video, headline, playback control
  OnboardingJourney.tsx            six-step flight-path rail; hosts the NDI trigger
  BoardingPass.tsx                 tilting pass, gate-scan animation
  SeedRecords.tsx                  demo data panel
  ndi/NdiButton.tsx                spec-compliant NDI button
  ndi/NdiScanModal.tsx             spec-compliant scan popup
  ndi/QrCode.tsx                   SVG QR renderer
public/
  Video_KB.mp4                     hero footage
```

## Bhutan NDI UI compliance

The popup follows the Bhutan NDI UI Specifications: mandated block order
(Header, Open wallet, QR, Instructions, Watch Video Guide, Download, Support),
`#F8F8F8` panel, `#5AC994` / `#124143`, Inter, 30px block spacing, and the exact
prescribed wording. NDI colours live in `lib/ndi/config.ts`, deliberately
outside the Drukair theme tokens so the two palettes cannot bleed together.

Where the spec's written language lists disagree with the casing in its
reference screenshot, the written list wins — it is phrased as a requirement
("with the text as below").

Still missing, because they were attached to the spec email rather than
supplied here (each renders only when present, so nothing invented ships):
the NDI logo (needed on the button and in the QR centre), the app's scan icon,
the YouTube tutorial URL, and the official store badges.

## The interactive bits

- **Hero** — the video autoplays muted on a loop behind a two-axis scrim, drifts
  and scales slightly on scroll, and the copy fades out as you leave. A pause
  button sits bottom-right, because background motion running longer than five
  seconds needs a way to stop it.
- **Journey rail** — six stages sit on an SVG curve. The aircraft flies between
  them along the real path geometry (`getPointAtLength`), offset onto the path
  normal so it never covers a stage marker. Auto-advances every 4.6s, pauses on
  hover/focus or while the NDI popup is open, and has an Auto/Manual toggle.
- **Step control** — the rail is decorative (`aria-hidden`); the real control is
  a `role="tablist"` chip row that works with arrow keys, Home and End.
- **Boarding pass** — tilts in 3D toward the pointer with a gloss that tracks
  it, and "Scan at the gate" runs a scanner sweep into a BOARDED stamp.

## Notes

- **`globalThis` pinning is load-bearing.** `sessions.ts`, `records.ts` and the
  token cache stash their state on `globalThis`. Turbopack compiles route
  handlers on demand, and two routes can otherwise end up with separate
  instances of the same module — silently unsharing a plain module-level
  singleton. This was a real, reproduced bug, not a precaution.
- **Issuance is never retried.** Every other NDI call retries transport
  failures, because NDI staging drops pooled keep-alive connections. Issuance
  does not: a timeout says nothing about whether NDI already issued, and a
  duplicate credential cannot be un-issued.
- **Webhook retry contract.** NDI retries up to ten times until it gets a 2xx,
  so anything genuinely handled — including callbacks we intentionally ignore —
  returns 202. Only a real server-side fault returns 500.
- Every animation is gated behind `useReducedMotion` / a
  `prefers-reduced-motion` block.
- `DragonMark`'s bolt is `currentColor`, so one component serves the dark hero,
  the white nav and the navy footer. Callers must set a text colour on dark
  backgrounds.
- A seat-picker section was removed at the client's request; the pass carries a
  fixed seat (`SEAT` in `BoardingPass.tsx`).

## Known limitations

- **`/api/records` is unauthenticated.** It decides who can be issued a
  credential, so anyone who can reach it can add themselves. Put it behind auth
  or remove it before exposing this publicly.
- **`/webhook` logs the full raw callback body**, including disclosed identity
  attributes in plaintext. Useful while integrating; narrow it before handling
  real passenger data (`mask()` in `lib/ndi/attrs.ts` is already used elsewhere).
- **The hero video is 3840×2160 and ~37 MB** — far heavier than a background
  should be. Re-encode to 1080p H.264 at 2–4 Mbps plus a WebM, and add a
  `poster` frame.
- Nothing survives a restart; see Deployment.
