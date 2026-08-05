"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { assets, brand, copy } from "@/lib/ndi/config";
import QrCode, { type QrMatrix } from "./QrCode";

type ProofResponse = {
  threadId: string;
  proofRequestURL: string;
  deepLinkURL: string;
  qr: QrMatrix;
  subscribed: boolean;
};

type State =
  | { status: "loading" }
  | { status: "ready"; data: ProofResponse }
  | { status: "error"; message: string };

/** The follow-on credential issuance — a second, slower NDI call made after
 *  the proof itself already resolved, so it's tracked apart from `status`. */
type IssuanceInfo =
  | { status: "issuing" }
  | { status: "issued"; credInviteURL?: string; deepLinkURL?: string }
  | { status: "failed"; reason: string };

/** Mirrors GET /api/ndi/status/:threadId */
type Outcome =
  | { status: "pending" }
  | {
      status: "verified";
      attributes: Record<string, string>;
      holderDid: string | null;
      relationshipDid: string | null;
      issuance: IssuanceInfo | null;
    }
  | { status: "consumed"; issuance: IssuanceInfo | null }
  | { status: "declined" }
  | { status: "not_registered" }
  | { status: "failed"; reason?: string }
  | { status: "expired" }
  | { status: "unknown" };

const POLL_INTERVAL_MS = 2000;

/** Stand-in for the NDI app's green scan icon until the real asset arrives. */
function ScanGlyph() {
  return (
    <span
      className="inline-grid h-[18px] w-[18px] place-items-center rounded-full align-[-4px]"
      style={{ backgroundColor: brand.green }}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" aria-hidden="true">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        </g>
      </svg>
    </span>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M10 8.5v7l5.5-3.5L10 8.5z" fill={brand.popupBg} />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="currentColor" />
      <path
        d="M4 7.5l8 5.5 8-5.5"
        fill="none"
        stroke={brand.popupBg}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Progress/result of the follow-on issuance, shown beneath the proof result. */
function IssuanceStatusLine({ issuance }: { issuance: IssuanceInfo | null }) {
  if (!issuance) return null;

  if (issuance.status === "issuing") {
    return (
      <p className="mt-4 text-sm" style={{ color: brand.muted }}>
        Issuing your credential…
      </p>
    );
  }

  if (issuance.status === "issued") {
    return (
      <div className="mt-4">
        <p className="text-sm font-semibold" style={{ color: brand.green }}>
          Credential sent to your wallet
        </p>
        {/* Only present when NDI had to open a fresh relationship — when the
            existing one from check-in was reused, nothing further to scan. */}
        {issuance.deepLinkURL && (
          <a
            href={issuance.deepLinkURL}
            style={{ backgroundColor: brand.green, color: brand.white }}
            className="mt-3 inline-flex h-10 items-center justify-center rounded-lg px-5 text-sm font-semibold"
          >
            Open Bhutan NDI wallet
          </a>
        )}
      </div>
    );
  }

  return <p className="mt-4 text-sm text-red-600">{issuance.reason}</p>;
}

/** Replaces the QR once the check-in reaches a terminal state. */
function OutcomePanel({
  outcome,
  onRetry,
}: {
  outcome: Exclude<Outcome, { status: "pending" }>;
  onRetry: () => void;
}) {
  if (outcome.status === "verified") {
    return (
      <div className="px-5">
        <div
          className="mx-auto grid h-12 w-12 place-items-center rounded-full"
          style={{ backgroundColor: brand.green }}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" aria-hidden="true">
            <path
              d="m5 12.5 4.5 4.5L19 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="mt-3 font-semibold">Identity verified</p>
        <dl className="mt-3 space-y-1 text-left text-sm">
          {Object.entries(outcome.attributes).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3">
              <dt style={{ color: brand.muted }}>{key}</dt>
              <dd className="font-mono">{value}</dd>
            </div>
          ))}
        </dl>
        <IssuanceStatusLine issuance={outcome.issuance} />
      </div>
    );
  }

  if (outcome.status === "consumed") {
    // Attributes were already shown on the first poll; from here on there is
    // only issuance progress left to report.
    return (
      <div className="px-5">
        {outcome.issuance ? (
          <IssuanceStatusLine issuance={outcome.issuance} />
        ) : (
          <p className="text-sm" style={{ color: brand.muted }}>
            This check-in was already completed.
          </p>
        )}
      </div>
    );
  }

  const message =
    outcome.status === "declined"
      ? "You declined the request in your wallet."
      : outcome.status === "not_registered"
        ? "This ID number isn't recognized."
        : outcome.status === "expired"
          ? "This code expired. Generate a new one."
          : outcome.status === "unknown"
            ? "This check-in is no longer available."
            : (outcome.reason ?? "Check-in could not be completed.");

  return (
    <div className="px-5">
      <p className="text-sm" style={{ color: brand.muted }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 text-sm font-semibold underline"
        style={{ color: brand.green }}
      >
        Try again
      </button>
    </div>
  );
}

/**
 * The Bhutan NDI scan popup, laid out to match the reference design in the UI
 * Specifications document.
 *
 * Mandated block order, separated by 30px: Header, Open wallet button, QR,
 * Instructions, Watch Video Guide, Download, Support. The Download and Support
 * blocks each have a 10px inner gap before their sub-content.
 *
 * Mounted only while open — the parent wraps it in <AnimatePresence> — so it
 * starts in `loading` and needs no state reset on reopen. Each mount creates a
 * fresh proof request, because thread IDs are single-use.
 */
export default function NdiScanModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [outcome, setOutcome] = useState<Outcome>({ status: "pending" });
  /** Held separately because the server only ever hands these over once. */
  const [verified, setVerified] = useState<null | {
    attributes: Record<string, string>;
    holderDid: string | null;
    relationshipDid: string | null;
  }>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchProofRequest = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/ndi/proof-request", { method: "POST", signal });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
      return { status: "ready", data: body as ProofResponse } satisfies State;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      return {
        status: "error",
        message: e instanceof Error ? e.message : "Could not reach Bhutan NDI",
      } satisfies State;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    void fetchProofRequest(controller.signal).then((next) => {
      if (live && next) setState(next);
    });
    return () => {
      live = false;
      controller.abort();
    };
  }, [fetchProofRequest]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const data = state.status === "ready" ? state.data : null;
  const threadId = data?.threadId;
  const canPoll = Boolean(threadId && data?.subscribed);

  /**
   * Poll for the outcome once a proof request exists. Stops on any terminal
   * state, and doesn't start at all when the webhook isn't wired up — nothing
   * could ever resolve it, so polling would just be noise.
   */
  useEffect(() => {
    if (!canPoll || !threadId) return;

    let live = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch(`/api/ndi/status/${encodeURIComponent(threadId)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as Outcome;
        if (!live) return;
        // The disclosed attributes are delivered exactly once (the server flips
        // VERIFIED -> CONSUMED on that read), so snapshot them. Later polls come
        // back as "consumed" while issuance finishes, and without this the
        // success state would visibly collapse mid-flow.
        if (body.status === "verified") {
          setVerified({
            attributes: body.attributes,
            holderDid: body.holderDid,
            relationshipDid: body.relationshipDid,
          });
        }
        setOutcome(body);
        // Keep polling while pending, and also while the proof itself resolved
        // but issuance is still running — issuance is a second, slower call
        // that finishes well after the proof result does.
        const issuing =
          (body.status === "verified" || body.status === "consumed") &&
          body.issuance?.status === "issuing";
        if (body.status === "pending" || issuing) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch {
        // Transient network blip: keep polling rather than failing the check-in.
        if (live) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [canPoll, threadId]);

  const retry = () => {
    setState({ status: "loading" });
    setOutcome({ status: "pending" });
    setVerified(null);
    void fetchProofRequest().then((next) => {
      if (next) setState(next);
    });
  };

  /**
   * Once verified, keep showing the verified panel and let only the issuance
   * line change underneath it — rather than flipping to a bare "consumed"
   * message the moment the attributes have been handed over.
   */
  const shown: Outcome =
    verified && (outcome.status === "verified" || outcome.status === "consumed")
      ? { status: "verified", ...verified, issuance: outcome.issuance ?? null }
      : outcome;

  return (
    <motion.div
      className="fixed inset-0 z-100 grid place-items-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="absolute inset-0 bg-[#04121e]/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ndi-popup-title"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        style={{
          backgroundColor: brand.popupBg,
          fontFamily: "var(--font-inter)",
          color: brand.teal,
        }}
        className="relative max-h-[92vh] w-full max-w-[590px] overflow-y-auto rounded-2xl px-6 py-[30px] text-center text-base shadow-2xl outline-none sm:px-10"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full text-black/40 transition-colors hover:bg-black/5 hover:text-black/70"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="flex flex-col items-center gap-[30px]">
          {/* 1 — Header */}
          <h2 id="ndi-popup-title" className="text-[18px] font-semibold">
            {copy.titlePrefix}
            <span style={{ color: brand.green }}>{copy.titleBrand}</span>
            {copy.titleSuffix}
          </h2>

          {/* 2 — Open Bhutan NDI wallet */}
          {data?.deepLinkURL ? (
            <a
              href={data.deepLinkURL}
              style={{ backgroundColor: brand.green, color: brand.white }}
              className="inline-flex h-[50px] w-full max-w-[300px] items-center justify-center rounded-lg font-semibold transition-opacity hover:opacity-90"
            >
              {copy.openWallet}
            </a>
          ) : (
            <span
              className="inline-flex h-[50px] w-full max-w-[300px] items-center justify-center rounded-lg font-semibold opacity-40"
              style={{ backgroundColor: brand.green, color: brand.white }}
              aria-hidden="true"
            >
              {copy.openWallet}
            </span>
          )}

          {/* OR divider */}
          <div
            className="flex w-full max-w-[300px] items-center gap-3"
            aria-hidden="true"
          >
            <span className="h-px flex-1 bg-black/15" />
            <span className="text-sm" style={{ color: brand.muted }}>
              {copy.or}
            </span>
            <span className="h-px flex-1 bg-black/15" />
          </div>

          {/* 3 — QR code, in the spec's green rounded frame */}
          <div
            className="grid h-[264px] w-[264px] place-items-center rounded-2xl border-2 bg-white"
            style={{ borderColor: brand.green }}
          >
            {state.status === "loading" && (
              <span className="text-sm" style={{ color: brand.muted }}>
                Generating QR code…
              </span>
            )}
            {state.status === "error" && (
              <div className="px-4">
                <p className="text-sm font-medium text-red-600">{state.message}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-3 text-sm font-semibold underline"
                  style={{ color: brand.green }}
                >
                  Try again
                </button>
              </div>
            )}
            {data && shown.status === "pending" && <QrCode matrix={data.qr} px={232} />}
            {data && shown.status !== "pending" && (
              <OutcomePanel outcome={shown} onRetry={retry} />
            )}
          </div>

          {/* 4 — Instructions: two numbered steps, left-aligned as a centred block */}
          <ol
            className="mx-auto max-w-[360px] list-none space-y-1.5 text-left"
            style={{ color: brand.muted }}
          >
            <li className="flex gap-2">
              <span aria-hidden="true">1.</span>
              <span>{copy.step1}</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true">2.</span>
              <span>
                {copy.step2Before}{" "}
                {assets.scanIconSrc ? (
                  <Image
                    src={assets.scanIconSrc}
                    alt=""
                    width={18}
                    height={18}
                    className="inline-block h-[18px] w-[18px] align-[-4px]"
                  />
                ) : (
                  <ScanGlyph />
                )}{" "}
                {copy.step2After}
              </span>
            </li>
          </ol>

          {/* 5 — Watch Video Guide */}
          <a
            href={assets.videoGuideUrl || undefined}
            target={assets.videoGuideUrl ? "_blank" : undefined}
            rel={assets.videoGuideUrl ? "noopener noreferrer" : undefined}
            aria-disabled={assets.videoGuideUrl ? undefined : true}
            title={
              assets.videoGuideUrl
                ? undefined
                : "Set assets.videoGuideUrl to the NDI YouTube tutorial"
            }
            style={{ borderColor: brand.green, color: brand.green }}
            className={`group inline-flex h-[40px] min-w-[200px] items-center justify-center gap-2 rounded-full border-2 px-5 font-medium transition-colors ${
              assets.videoGuideUrl
                ? "hover:bg-[#5AC994] hover:text-white"
                : "cursor-not-allowed opacity-60"
            }`}
          >
            {copy.watchVideo}
            <PlayGlyph />
          </a>

          {/* 6 — Download, with a 10px gap before the store badges */}
          <div className="flex flex-col items-center gap-[10px]">
            <p style={{ color: brand.muted }}>
              {copy.downloadPrompt}
              <br />
              <span className="font-semibold" style={{ color: brand.green }}>
                {copy.downloadCta}
              </span>
            </p>
            {(assets.playBadgeSrc || assets.appBadgeSrc) && (
              <div className="flex items-center justify-center gap-3">
                {assets.playBadgeSrc && (
                  <a
                    href={assets.playStoreUrl || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      src={assets.playBadgeSrc}
                      alt="Get it on Google Play"
                      width={150}
                      height={44}
                      className="h-11 w-auto"
                    />
                  </a>
                )}
                {assets.appBadgeSrc && (
                  <a
                    href={assets.appStoreUrl || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      src={assets.appBadgeSrc}
                      alt="Download on the App Store"
                      width={150}
                      height={44}
                      className="h-11 w-auto"
                    />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* 7 — Support, with a 10px gap before the contact row */}
          <div className="flex flex-col items-center gap-[10px]">
            <p className="font-semibold" style={{ color: brand.green }}>
              {copy.supportHeader}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              {assets.supportEmail && (
                <a
                  href={`mailto:${assets.supportEmail}`}
                  className="inline-flex items-center gap-2 hover:underline"
                  style={{ color: brand.teal }}
                >
                  <span style={{ color: brand.green }}>
                    <MailGlyph />
                  </span>
                  {assets.supportEmail}
                </a>
              )}
              <a
                href={`tel:${copy.tollFree}`}
                className="inline-flex items-center gap-2 hover:underline"
                style={{ color: brand.teal }}
              >
                <span style={{ color: brand.green }}>
                  <PhoneGlyph />
                </span>
                {copy.tollFree}
              </a>
            </div>
          </div>
        </div>

        {/* Thread ID surfaced for the demo — the handle the webhook arrives on. */}
        {data && (
          <p
            className="mt-[30px] font-mono text-[10px] tracking-wider break-all"
            style={{ color: brand.muted }}
          >
            thid {data.threadId}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
