"use client";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";

type Health = { ok: boolean; ts: string } | null;
type StatusCard = {
  title: string;
  description: string;
  endpoint: string;
  parse: (json: any) => { ok: boolean; details?: string };
};

const statusCards: StatusCard[] = [
  {
    title: "Database",
    description: "Checks connectivity to the external DB",
    endpoint: "/api/database-status",
    parse: (j) => ({ ok: !!j?.connected, details: j?.error || undefined }),
  },
  {
    title: "Dialfire API",
    description: "Verifies access to Dialfire campaigns",
    endpoint: "/api/dialfire-status",
    parse: (j) => ({ ok: !!j?.connected, details: j?.error || undefined }),
  },
  {
    title: "Campaign mapping",
    description: "Loads cached campaign ID → title map",
    endpoint: "/api/campaign-mapping",
    parse: (j) => ({ ok: j?.status === "success" }),
  },
];

export default function Page() {
  const { data, status } = useSession();
  const [health, setHealth] = useState<Health>(null);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, { ok: boolean; details?: string }>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const h = await fetch("/healthz").then((r) => r.json());
        if (!cancelled) setHealth(h);
        const entries = await Promise.all(
          statusCards.map(async (c) => {
            try {
              const j = await fetch(c.endpoint, { credentials: "include" }).then((r) => r.json());
              return [c.title, c.parse(j)] as const;
            } catch (e: any) {
              return [c.title, { ok: false, details: e?.message || "Request failed" }] as const;
            }
          })
        );
        if (!cancelled) setResults(Object.fromEntries(entries));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (status === "loading" || loading) {
    return (
      <main className="min-h-screen bg-neutral-100 text-neutral-900">
        <div className="p-6">Loading…</div>
      </main>
    );
  }

  const roles = (data?.user as any)?.roles || [];

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-900">
      {/* Header resembling IBM-like spacing */}
      <header className="sticky top-0 z-10 bg-white border-b border-black/10">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden md:block text-neutral-600">{data?.user?.email} · {roles.join(", ") || "—"}</div>
            <button
              className="px-3 py-2 rounded bg-neutral-900 text-white"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Body with left sidebar and content grid (matches side-panel inspiration) */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 hidden lg:block border-r border-black/10 bg-white">
          <div className="px-4 py-3 font-medium text-neutral-700">Navigation</div>
          <nav className="px-2 pb-4 space-y-1 text-sm">
            <a className="flex items-center justify-between rounded px-3 py-2 hover:bg-neutral-100" href="#">
              <span>Overview</span>
              <span className="text-[10px] rounded bg-neutral-900 text-white px-1.5 py-0.5">New</span>
            </a>
            <a className="block rounded px-3 py-2 hover:bg-neutral-100" href="#">Projects</a>
            <a className="block rounded px-3 py-2 hover:bg-neutral-100" href="#">Agents</a>
            <a className="block rounded px-3 py-2 hover:bg-neutral-100" href="#">Settings</a>
          </nav>
        </aside>

        {/* Main content */}
        <section className="flex-1 min-w-0 p-6">
          <div className="mb-6 text-sm text-neutral-600">Backend: {health?.ok ? "OK" : "Unavailable"} · {health?.ts && new Date(health.ts).toLocaleString()}</div>

          {/* Card row */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {statusCards.map((c) => {
              const r = results[c.title];
              const ok = r?.ok;
              return (
                <div key={c.title} className="rounded-lg border border-black/10 bg-white p-4">
                  <div className="text-base font-semibold mb-1">{c.title}</div>
                  <div className="text-xs text-neutral-600 mb-3">{c.description}</div>
                  <div className={ok ? "text-emerald-600" : "text-red-600"}>{ok ? "Connected" : "Not connected"}</div>
                  {!ok && r?.details && (
                    <div className="mt-2 text-xs text-neutral-600 break-words">{r.details}</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
