"use client";
import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { useSession, signOut } from "next-auth/react";

type Agent = { id: string; name: string };

export default function StatsPage() {
  const { data: session } = useSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Load agents from Express backend (rewritten via next.config)
  useEffect(() => {
    fetch("/api/agents", { credentials: "include" })
      .then(r => r.json())
      .then((list: Agent[]) => setAgents(list))
      .catch(() => setAgents([]));
  }, []);

  const userEmail = session?.user?.email ?? "";

  const canSearch = selectedAgentIds.length > 0 && (dateFrom || dateTo);

  const handleToggleAgent = (id: string) => {
    setSelectedAgentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <main className="min-h-screen flex flex-col bg-neutral-100 text-neutral-900">
      {/* IBM-like top header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-black/10 bg-white">
        <div className="text-2xl font-semibold tracking-tight">Statistics</div>
        <div className="flex items-center gap-3">
          {/* Language switcher (reuse visual style) */}
          <button className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">DE</button>
          {/* User box */}
          <button onClick={() => signOut({ callbackUrl: "/" })} className="rounded-full border border-black/10 bg-white px-4 py-1.5 text-sm hover:bg-neutral-50">
            {userEmail || "Account"}
          </button>
        </div>
      </header>

      {/* Form block inspired by BA search panel (no ads) */}
      <section className="px-6 py-6">
        <div className="mx-auto max-w-6xl rounded-lg border border-black/10 bg-white p-4">
          {/* Tabs placeholder */}
          <div className="flex gap-2 mb-4 text-sm">
            <button className="rounded px-3 py-1.5 bg-neutral-900 text-white">Agents</button>
            <button className="rounded px-3 py-1.5 bg-neutral-100 text-neutral-700 border border-black/10">Projects</button>
          </div>

          <div className="grid gap-3 md:grid-cols-12">
            {/* Trip type style → selection type */}
            <div className="md:col-span-2">
              <label className="block text-xs text-neutral-600 mb-1">Selection</label>
              <div className="rounded border border-black/10 bg-white px-3 py-2 text-sm">Agents</div>
            </div>

            {/* From/To like date pickers */}
            <div className="md:col-span-4">
              <label className="block text-xs text-neutral-600 mb-2">Date range</label>
              <div className="rounded border border-black/10 bg-white p-2">
                <DayPicker
                  mode="range"
                  selected={dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined}
                  onSelect={(range: any) => { setDateFrom(range?.from); setDateTo(range?.to); }}
                  showOutsideDays
                  styles={{ caption: { fontWeight: 600 }, day: { borderRadius: 4 } }}
                />
              </div>
            </div>

            {/* Agent multi-select */}
            <div className="md:col-span-4">
              <label className="block text-xs text-neutral-600 mb-1">Agents</label>
              <div className="h-28 overflow-y-auto rounded border border-black/10 bg-white p-2 text-sm">
                {agents.map(a => (
                  <label key={a.id} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={selectedAgentIds.includes(a.id)} onChange={() => handleToggleAgent(a.id)} />
                    <span className="truncate">{a.name}</span>
                  </label>
                ))}
                {agents.length === 0 && (<div className="text-neutral-500">No agents</div>)}
              </div>
            </div>

            {/* Action */}
            <div className="md:col-span-2 flex items-end">
              <button disabled={!canSearch} className={`w-full rounded px-4 py-2 text-sm ${canSearch ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-500"}`}>Search</button>
            </div>
          </div>
        </div>
      </section>

      {/* Results placeholder */}
      <section className="px-6 pb-10">
        <div className="mx-auto max-w-6xl text-sm text-neutral-600">Results will appear here.</div>
      </section>
    </main>
  );
}


