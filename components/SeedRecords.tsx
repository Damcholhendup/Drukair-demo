"use client";

import { useCallback, useEffect, useState } from "react";

type RecordRow = {
  cid: string;
  credentialData: Record<string, string>;
  source: "seed" | "manual";
  addedAt: number;
};

type Rows =
  | { status: "loading" }
  | { status: "ready"; records: RecordRow[] }
  | { status: "error"; message: string };

const EMPTY_FORM = { cid: "", cif: "", bankName: "" };

/**
 * Demo-only panel for seeding which ID Numbers are allowed to receive a
 * credential. Sits at the bottom of the page and is intentionally styled as a
 * utility rather than part of the Drukair experience.
 *
 * The backing store is in memory, so entries last until the server restarts.
 */
export default function SeedRecords() {
  const [rows, setRows] = useState<Rows>({ status: "loading" });
  const [form, setForm] = useState(EMPTY_FORM);
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
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setRows({ status: "ready", records: body.records as RecordRow[] });
      setNotice(
        body.replaced
          ? `Updated ${body.record.cid}`
          : `Added ${body.record.cid}`,
      );
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(cid: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/records?cid=${encodeURIComponent(cid)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setRows({ status: "ready", records: body.records as RecordRow[] });
      setNotice(`Removed ${cid}`);
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
          Registers which ID Numbers can be issued a credential at check-in.
          When a passenger&apos;s proof discloses an ID Number listed here, the
          matching CIF and Bank Name are issued to their wallet. Stored in
          memory — entries clear when the server restarts.
        </p>

        <form
          onSubmit={add}
          className="mt-8 grid gap-3 sm:grid-cols-[1.2fr_0.8fr_1fr_auto] sm:items-end"
        >
          <label className="block">
            <span className="text-ink-400 mb-1.5 block font-mono text-[10px] tracking-[0.18em] uppercase">
              ID Number
            </span>
            <input
              className={field}
              value={form.cid}
              onChange={(e) => setForm({ ...form, cid: e.target.value })}
              placeholder="11305003415"
              maxLength={64}
              required
            />
          </label>
          <label className="block">
            <span className="text-ink-400 mb-1.5 block font-mono text-[10px] tracking-[0.18em] uppercase">
              CIF
            </span>
            <input
              className={field}
              value={form.cif}
              onChange={(e) => setForm({ ...form, cif: e.target.value })}
              placeholder="1234"
              maxLength={64}
              required
            />
          </label>
          <label className="block">
            <span className="text-ink-400 mb-1.5 block font-mono text-[10px] tracking-[0.18em] uppercase">
              Bank Name
            </span>
            <input
              className={field}
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              placeholder="BOB"
              maxLength={64}
              required
            />
          </label>
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
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-haze-200 text-ink-400 border-b">
                    {["ID Number", "CIF", "Bank Name", ""].map((h, i) => (
                      <th
                        key={h || i}
                        className="px-5 py-3 font-mono text-[10px] font-normal tracking-[0.18em] uppercase"
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
                      <td className="text-ink-900 px-5 py-3 font-mono">
                        {r.cid}
                        {r.source === "seed" && (
                          <span className="text-ink-400 ml-2 font-sans text-[10px] tracking-wider uppercase">
                            seed
                          </span>
                        )}
                      </td>
                      <td className="text-ink-700 px-5 py-3 font-mono">
                        {r.credentialData["CIF"] ?? "—"}
                      </td>
                      <td className="text-ink-700 px-5 py-3 font-mono">
                        {r.credentialData["Bank Name"] ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => remove(r.cid)}
                          disabled={busy}
                          className="text-ink-400 hover:text-red-600 text-xs font-semibold transition-colors disabled:opacity-50"
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
