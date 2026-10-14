# Drukair — Passenger Onboarding (concept)

A single-page website concept for Drukair walking a passenger through the
process of getting on board the aircraft, from the check-in counter to the
cabin seat — with a **working Bhutan NDI integration** behind two selectable
flows (a live toggle on the page, not just a deploy-time choice):

- **Online** — two stages: check-in proves the passenger's CID and issues a
  ticket VC, then the boarding-gate step proves the ticket itself (the actual
  Ticket Number, disclosed from that VC) and issues a boarding-pass VC.
- **Walk-in** — one stage: proves the CID once at the counter and issues the
  boarding-pass VC directly, with no ticket VC in between.

Every credential is always issued straight to the wallet via the proof's
relationship (no second scan to *receive* it); optionally, the online flow's
boarding-pass *proof request* itself can also skip a fresh QR and go straight
to the same relationship established at check-in — see `NDI_BOARDING_NO_RESCAN`
below.

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
| `NDI_FOUNDATIONAL_SCHEMA_URL` | Schema the holder **presents** at both stages (a CID proof, today) |
| `NDI_ISSUANCE_SCHEMA_URL` | Schema of the **Ticket VC**, issued at the ticket stage |
| `NDI_BOARDING_SCHEMA_URL` | Schema of the **Boarding Pass VC**, issued at the boarding-pass stage (online) or directly (walk-in) |
| `NDI_BOARDING_NO_RESCAN` | `true` sends the boarding-pass proof request straight to the ticket stage's relationship, skipping a fresh QR. **Unverified** — see the note in `lib/ndi/config.ts` |
| `NEXT_PUBLIC_NDI_FLOW_UI_MODE` | Only affects the **online** flow's internal staging: `separate` (default) — two triggers, check-in then boarding gate. `continuous` — one trigger runs both stages in one popup. (Online vs walk-in itself is a live button on the page, not an env var.) |
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

A radio-button toggle at the top of the journey section picks **Online
check-in** or **Walk-in counter** — both run through the same mechanics,
dispatched by a `kind: "ticket" | "boarding" | "walkin"` on the session (see
`lib/ndi/sessions.ts`):

```
Online flow, stage 1 — ticket (Check-in)
  POST /api/ndi/proof-request { kind: "ticket" }
    → authenticate (token cached ~24h)
    → verifier: create proof request → proofRequestURL, threadId
    → concurrently: subscribe the thread  +  build the QR matrix
    ← { threadId, mode: "qr", proofRequestURL, deepLinkURL, qr, subscribed }

  Holder shares the proof → POST /webhook
    → constant-time check of Authorization against NDI_WEBHOOK_AUTH_TOKEN
    → correlate by thid; atomic PENDING → terminal (idempotent under retries)
    → look up the disclosed ID Number in the seed store
    → 202 to NDI immediately
    → in the background: issue the ticket VC to holder_did, passing
      relationship_did as `forRelationship` so the wallet needs no second scan
    → on success, mark the record's ticket as issued (unlocks stage 2)

Online flow, stage 2 — boarding pass (Boarding gate)
  POST /api/ndi/proof-request { kind: "boarding", relationshipDid? }
    → same as above, but the proof asks for the passenger's Ticket Number,
      restricted to the Ticket VC schema — only satisfiable by presenting the
      actual credential issued at stage 1, not by disclosing the CID again
    → if NDI_BOARDING_NO_RESCAN=true and a relationshipDid was passed, the
      request targets it directly — NDI's response then omits proofRequestURL,
      which is what flips the popup into "push" mode (no QR shown)

  Holder shares the proof → POST /webhook
    → looks up the record by the disclosed Ticket Number (findRecordByTicketNumber),
      not by CID — then refuses to issue (status NOT_TICKETED) unless that
      record's ticket was already issued in stage 1
    → on success, issues the boarding-pass VC the same way

Walk-in flow — one stage (Check-in, when "Walk-in counter" is selected)
  POST /api/ndi/proof-request { kind: "walkin" }
    → identical mechanics to the ticket stage's proof request
  Holder shares the proof → POST /webhook
    → same correlation as ticket — only checks the CID is registered, with no
      ticket-VC gate — then issues the boarding-pass VC directly

GET /api/ndi/status/:threadId
  → polled by the popup; disclosed attributes delivered exactly once
    (VERIFIED → CONSUMED), issuance progress reported until it settles
```

`NEXT_PUBLIC_NDI_FLOW_UI_MODE` decides how stage 2 is reached in the UI:
`separate` surfaces it as its own trigger at the boarding-gate step, disabled
until stage 1 issues; `continuous` has the check-in popup advance itself into
stage 2 the moment the ticket is issued, without closing.

### Changing what is asked for and issued

All in `lib/ndi/config.ts`:

- `ticketProofRequest` / `boardingProofRequest` / `walkinProofRequest` — what
  the holder must present at each stage/flow. Attribute names are matched
  **literally** by NDI, so `"ID Number"` keeps its space and capitals.
  `subjectAttribute` is the one used to identify the passenger — a validated
  proof that omits it is treated as a configuration error, not an unknown
  traveller.
- `issuance.ticket.schemaId()` / `issuance.boarding.schemaId()` — the Ticket VC
  and Boarding Pass VC schemas respectively. Walk-in issues via
  `issuance.boarding` too (same credential as the online flow's second stage).
- `boarding.noRescan` — see `NDI_BOARDING_NO_RESCAN` above. Only applies to the
  online flow's boarding stage; walk-in has no earlier relationship to reuse.

Per-passenger credential data comes from `lib/ndi/records.ts`'s
`TICKET_FIELDS` / `BOARDING_FIELDS` and each record's `ticketData` /
`boardingData`, keyed by the disclosed subject attribute.

### Demo data panel

The section at the bottom of the page registers which CIDs may receive a
Ticket VC and/or Boarding Pass VC. To use your own wallet: share a proof once,
find your real ID Number in the `[ndi-webhook] RAW body` server log, then add
it as a CID along with the Ticket VC fields (Passenger Name, Booking
Reference, Ticket Number, Issued By, Carrier Code, Flight No, Departure Time,
Arrival Time, Seat) and Boarding Pass VC fields (Airline, Class, Name of
Passenger, From, To, Flight, Date, Seq. No, Boarding Time, Seat No, Gate). In
the online flow, the same CID can then receive the boarding pass at the
boarding-gate step, once the ticket exists; in the walk-in flow, that same
registration is enough on its own — the boarding pass issues directly, no
ticket VC required.

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
  OnboardingJourney.tsx            two-step flight-path rail; hosts the NDI triggers and flow toggle
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
- **Journey rail** — the two real stages (check-in, boarding gate) sit on an
  SVG curve. The aircraft flies between them along the real path geometry
  (`getPointAtLength`), offset onto the path normal so it never covers a stage
  marker. Auto-advances every 4.6s, pauses on hover/focus or while the NDI
  popup is open, and has an Auto/Manual toggle. Its accent color (gradient,
  markers, active tab) follows the online/walk-in flow toggle.
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
