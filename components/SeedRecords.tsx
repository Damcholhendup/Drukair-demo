"use client";

import { useCallback, useEffect, useState } from "react";

type RecordRow = {
  cid: string;
  ticketData: Record<string, string>;
  boardingData: Record<string, string>;
  source: "seed" | "manual";
  addedAt: number;
  ticketIssuedAt?: number;
};

type Rows =
  | { status: "loading" }
  | { status: "ready"; records: RecordRow[] }
  | { status: "error"; message: string };

/**
 * Field key -> schema attribute name/placeholder, mirroring TICKET_FIELDS /
 * BOARDING_FIELDS in lib/ndi/records.ts. Duplicated here rather than imported
 * — that module is `server-only` and can't be pulled into a client component
 * — so a schema change means updating both places.
 */
const TICKET_FORM_FIELDS = [
  { key: "passengerName", label: "Passenger Name", placeholder: "Demo Passenger" },
  { key: "bookingReference", label: "Booking Reference", placeholder: "BR12345" },
  { key: "ticketNumber", label: "Ticket Number", placeholder: "TKT001" },
  { key: "issuedBy", label: "Issued By", placeholder: "Drukair" },
  { key: "carrierCode", label: "Carrier Code", placeholder: "KB" },
  { key: "flightNo", label: "Flight No", placeholder: "KB101" },
  { key: "departureTime", label: "Departure Time", placeholder: "09:00" },
  { key: "arrivalTime", label: "Arrival Time", placeholder: "11:00" },
  { key: "seat", label: "Seat", placeholder: "12A" },
] as const;

const BOARDING_FORM_FIELDS = [
  { key: "airline", label: "Airline", placeholder: "Drukair" },
  { key: "travelClass", label: "Class", placeholder: "Economy" },
  { key: "nameOfPassenger", label: "Name of Passenger", placeholder: "Demo Passenger" },
  { key: "from", label: "From", placeholder: "Paro" },
  { key: "to", label: "To", placeholder: "Bangkok" },
  { key: "flight", label: "Flight", placeholder: "KB101" },
  { key: "date", label: "Date", placeholder: "2026-08-19" },
  { key: "seqNo", label: "Seq. No", placeholder: "045" },
  { key: "boardingTime", label: "Boarding Time", placeholder: "08:30" },
  { key: "seatNo", label: "Seat No", placeholder: "12A" },
  { key: "gate", label: "Gate", placeholder: "Gate 2" },
] as const;

/** The schema attribute names, in display order, for table columns. */
const TICKET_COLUMNS = TICKET_FORM_FIELDS.map((f) => f.label);
const BOARDING_COLUMNS = BOARDING_FORM_FIELDS.map((f) => f.label);

const emptyOf = (fields: readonly { key: string }[]) =>
  Object.fromEntries(fields.map((f) => [f.key, ""])) as Record<string, string>;

/**
 * Demo-only panel for seeding which CIDs can be issued the Ticket VC and/or
 * Boarding Pass VC. Sits at the bottom of the page and is intentionally
 * styled as a utility rather than part of the Drukair experience.
 *
 * The backing store is in memory, so entries last until the server restarts.
 */
export default function SeedRecords() {
  const [rows, setRows] = useState<Rows>({ status: "loading" });
  const [cid, setCid] = useState("");
  const [ticket, setTicket] = useState<Record<string, string>>(() =>
    emptyOf(TICKET_FORM_FIELDS),
  );
  const [boarding, setBoarding] = useState<Record<string, string>>(() =>
    emptyOf(BOARDING_FORM_FIELDS),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/records", { cache: "no-store", signal });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      return { status: "ready", records: body.records as RecordRow[] } satisfies Rows;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      return {
        status: "error",
        message: e instanceof Error ? e.message : "Could not load records",
      } satisfies Rows;
    }
  }, []);

  // Initial fetch. State is already "loading", and the only setState happens in
  // the async continuation, so nothing is set synchronously inside the effect.
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    void load(controller.signal).then((next) => {
      if (live && next) setRows(next);
    });
    return () => {
      live = false;
      controller.abort();
    };
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid, ticket, boarding }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setRows({ status: "ready", records: body.records as RecordRow[] });
      setNotice(
        body.replaced ? `Updated ${body.record.cid}` : `Added ${body.record.cid}`,
      );
      setCid("");
      setTicket(emptyOf(TICKET_FORM_FIELDS));
      setBoarding(emptyOf(BOARDING_FORM_FIELDS));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(recordCid: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/records?cid=${encodeURIComponent(recordCid)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setRows({ status: "ready", records: body.records as RecordRow[] });
      setNotice(`Removed ${recordCid}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "border-haze-300 focus:border-saffron-500 text-ink-900 placeholder:text-ink-400/70 h-11 w-full rounded-lg border bg-white px-3 font-mono text-sm outline-none transition-colors";

  return (
    <section id="demo-data" className="bg-haze-100 border-haze-200 border-t">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-ink-900 text-lg font-semibold tracking-tight">
            Demo data
          </h2>
          <span className="border-haze-300 text-ink-400 rounded-full border border-dashed px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] uppercase">
            Not part of the site
          </span>
        </div>
        <p className="text-ink-500 mt-2 max-w-2xl text-sm leading-relaxed">
          Registers which CIDs can be issued a Ticket VC and/or Boarding Pass
          VC. In the online flow, the Ticket VC is issued at check-in and the
          Boarding Pass VC only after that, at the boarding-gate step. In the
          walk-in flow, the Boarding Pass VC is issued directly — no Ticket VC
          required. Stored in memory — entries clear when the server restarts.
        </p>

        <form onSubmit={add} className="mt-8 space-y-6">
          <label className="block max-w-xs">
            <span className="text-ink-400 mb-1.5 block font-mono text-[10px] tracking-[0.18em] uppercase">
              CID
            </span>
            <input
              className={field}
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              placeholder="10402000479"
              maxLength={64}
              required
            />
          </label>

          <fieldset>
            <legend className="text-ink-400 mb-3 font-mono text-[10px] tracking-[0.2em] uppercase">
              Ticket VC fields
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {TICKET_FORM_FIELDS.map(({ key, label, placeholder }) => (
                <label key={key} className="block">
                  <span className="text-ink-400 mb-1.5 block font-mono text-[10px] tracking-[0.18em] uppercase">
                    {label}
                  </span>
                  <input
                    className={field}
                    value={ticket[key]}
                    onChange={(e) => setTicket({ ...ticket, [key]: e.target.value })}
                    placeholder={placeholder}
                    maxLength={64}
                    required
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-ink-400 mb-3 font-mono text-[10px] tracking-[0.2em] uppercase">
              Boarding pass VC fields
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {BOARDING_FORM_FIELDS.map(({ key, label, placeholder }) => (
                <label key={key} className="block">
                  <span className="text-ink-400 mb-1.5 block font-mono text-[10px] tracking-[0.18em] uppercase">
                    {label}
                  </span>
                  <input
                    className={field}
                    value={boarding[key]}
                    onChange={(e) => setBoarding({ ...boarding, [key]: e.target.value })}
                    placeholder={placeholder}
                    maxLength={64}
                    required
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={busy}
            className="from-saffron-500 to-gold-400 text-ink-900 h-11 rounded-lg bg-gradient-to-r px-6 text-sm font-semibold transition-transform duration-300 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Saving…" : "Add"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        {notice && !error && (
          <p className="text-saffron-600 mt-3 text-sm font-medium">{notice}</p>
        )}

        <div className="panel mt-8 overflow-hidden rounded-xl">
          {rows.status === "loading" && (
            <p className="text-ink-400 p-5 text-sm">Loading…</p>
          )}
          {rows.status === "error" && (
            <p className="p-5 text-sm text-red-600">{rows.message}</p>
          )}
          {rows.status === "ready" && rows.records.length === 0 && (
            <p className="text-ink-400 p-5 text-sm">
              No records. Nobody can be issued a credential until one is added.
            </p>
          )}
          {rows.status === "ready" && rows.records.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1600px] text-left text-sm">
                <thead>
                  <tr className="border-haze-200 text-ink-400 border-b">
                    {[
                      "CID",
                      "Ticket",
                      ...TICKET_COLUMNS,
                      ...BOARDING_COLUMNS,
                      "",
                    ].map((h, i) => (
                      <th
                        key={h || i}
                        className="px-5 py-3 font-mono text-[10px] font-normal whitespace-nowrap tracking-[0.18em] uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.records.map((r) => (
                    <tr
                      key={r.cid}
                      className="border-haze-200 border-b last:border-0"
                    >
                      <td className="text-ink-900 px-5 py-3 font-mono whitespace-nowrap">
                        {r.cid}
                        {r.source === "seed" && (
                          <span className="text-ink-400 ml-2 font-sans text-[10px] tracking-wider uppercase">
                            seed
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {r.ticketIssuedAt ? (
                          <span className="text-saffron-600 font-semibold">Issued</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      {TICKET_COLUMNS.map((col) => (
                        <td key={col} className="text-ink-700 px-5 py-3 font-mono whitespace-nowrap">
                          {r.ticketData[col] ?? "—"}
                        </td>
                      ))}
                      {BOARDING_COLUMNS.map((col) => (
                        <td key={col} className="text-ink-700 px-5 py-3 font-mono whitespace-nowrap">
                          {r.boardingData[col] ?? "—"}
                        </td>
                      ))}
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => remove(r.cid)}
                          disabled={busy}
                          className="text-ink-400 hover:text-red-600 text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
