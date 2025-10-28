'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import { InlineCalendar } from '@/components/InlineCalendar'

function formatISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function StatsPage() {
  const today = new Date()
  const defaultTo = formatISO(today)
  const defaultFrom = formatISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))

  const [dateFrom, setDateFrom] = useState<string>(defaultFrom)
  const [dateTo, setDateTo] = useState<string>(defaultTo)
  const [compare, setCompare] = useState<boolean>(true)

  // Simple calendar popovers
  const [openFrom, setOpenFrom] = useState(false)
  const [openTo, setOpenTo] = useState(false)
  const fromRef = useRef<HTMLDivElement | null>(null)
  const toRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null
      if (openFrom && fromRef.current && t && !fromRef.current.contains(t)) setOpenFrom(false)
      if (openTo && toRef.current && t && !toRef.current.contains(t)) setOpenTo(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpenFrom(false); setOpenTo(false) }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [openFrom, openTo])

  const qs = useMemo(() => new URLSearchParams({ dateFrom, dateTo }).toString(), [dateFrom, dateTo])

  const [summary, setSummary] = useState<any>(null)
  const [heatmap, setHeatmap] = useState<any[]>([])
  const [positiveMix, setPositiveMix] = useState<any[]>([])
  const [improvement, setImprovement] = useState<any[]>([])
  const [efficiency, setEfficiency] = useState<any | null>(null)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [targets, setTargets] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      fetch(`/api/stats/summary?${qs}`, { credentials: 'include' }).then(r=>r.json()).catch(()=>null),
      fetch(`/api/stats/heatmap?${qs}`, { credentials: 'include' }).then(r=>r.json()).catch(()=>[]),
      fetch(`/api/stats/positive-mix?${qs}`, { credentials: 'include' }).then(r=>r.json()).catch(()=>[]),
      fetch(`/api/stats/agent-improvement?${qs}`, { credentials: 'include' }).then(r=>r.json()).catch(()=>[]),
      fetch(`/api/stats/efficiency?${qs}`, { credentials: 'include' }).then(r=>r.json()).catch(()=>null),
      fetch(`/api/stats/campaign-effectiveness?${qs}`, { credentials: 'include' }).then(r=>r.json()).catch(()=>[]),
      fetch(`/api/stats/targets-progress?${qs}`, { credentials: 'include' }).then(r=>r.json()).catch(()=>[]),
    ]).then(([s,h,pm,imp,eff,ce,tp]) => {
      if (!alive) return
      setSummary(s)
      setHeatmap(Array.isArray(h)?h:[])
      setPositiveMix(Array.isArray(pm)?pm:[])
      setImprovement(Array.isArray(imp)?imp:[])
      setEfficiency(eff)
      setCampaigns(Array.isArray(ce)?ce:[])
      setTargets(Array.isArray(tp)?tp:[])
    }).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [qs])

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative" ref={fromRef}>
          <label className="block text-sm text-slate-700 mb-1">From</label>
          <button className="px-3 py-2 border border-slate-300 rounded bg-white" onClick={()=>setOpenFrom(v=>!v)}>{dateFrom}</button>
          {openFrom && (
            <div className="absolute z-10 mt-2 bg-white border border-slate-200 rounded shadow p-2">
              <InlineCalendar value={new Date(dateFrom)} onChange={(d)=>{ setDateFrom(formatISO(d)); setOpenFrom(false) }} visibleMonth={new Date(dateFrom).getMonth()} visibleYear={new Date(dateFrom).getFullYear()} onMonthChange={()=>{}} onYearChange={()=>{}} />
            </div>
          )}
        </div>
        <div className="relative" ref={toRef}>
          <label className="block text-sm text-slate-700 mb-1">To</label>
          <button className="px-3 py-2 border border-slate-300 rounded bg-white" onClick={()=>setOpenTo(v=>!v)}>{dateTo}</button>
          {openTo && (
            <div className="absolute z-10 mt-2 bg-white border border-slate-200 rounded shadow p-2">
              <InlineCalendar value={new Date(dateTo)} onChange={(d)=>{ setDateTo(formatISO(d)); setOpenTo(false) }} visibleMonth={new Date(dateTo).getMonth()} visibleYear={new Date(dateTo).getFullYear()} onMonthChange={()=>{}} onYearChange={()=>{}} />
            </div>
          )}
        </div>
        <label className="inline-flex items-center gap-2 ml-2 text-sm text-slate-700">
          <input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)} />
          Compare to previous period
        </label>
      </div>

      {/* Row 1: KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard title="Total Calls" value={summary?.totalCalls?.value ?? 0} delta={summary?.totalCalls?.comparison} trend={summary?.totalCalls?.trend} suffix="" />
        <KpiCard title="Reach Rate" value={summary?.reachRate?.value ?? 0} delta={summary?.reachRate?.comparison} trend={summary?.reachRate?.trend} suffix="%" />
        <KpiCard title="Positive" value={summary?.positiveOutcomes?.value ?? 0} delta={summary?.positiveOutcomes?.comparison} trend={summary?.positiveOutcomes?.trend} suffix="" />
        <KpiCard title="Avg Duration" value={summary?.avgDuration?.value ?? 0} delta={summary?.avgDuration?.comparison} trend={summary?.avgDuration?.trend} suffix=" min" />
        <KpiCard title="Conversion" value={summary?.conversionRate?.value ?? 0} delta={summary?.conversionRate?.comparison} trend={summary?.conversionRate?.trend} suffix="%" />
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded p-4">
          <div className="font-medium mb-2">Heatmap (weekday × hour)</div>
          <div className="text-slate-500 text-sm">{heatmap.length ? `${heatmap.length} cells` : 'No data'}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded p-4">
          <div className="font-medium mb-2">Positive mix</div>
          <div className="text-slate-500 text-sm">{positiveMix.length ? `${positiveMix.length} items` : 'No data'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded p-4">
          <div className="font-medium mb-2">Improvement leaderboard</div>
          <div className="text-slate-500 text-sm">{improvement.length ? `${improvement.length} agents` : 'No data'}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded p-4">
          <div className="font-medium mb-2">Efficiency</div>
          <div className="text-slate-500 text-sm">{efficiency ? 'Available' : 'No data'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded p-4">
          <div className="font-medium mb-2">Campaign effectiveness</div>
          <div className="text-slate-500 text-sm">{campaigns.length ? `${campaigns.length} campaigns` : 'No data'}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded p-4">
          <div className="font-medium mb-2">Targets progress</div>
          <div className="text-slate-500 text-sm">{targets.length ? `${targets.length} items` : 'No data'}</div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, delta, trend, suffix }: { title: string; value: number; delta?: number; trend?: 'up'|'down'|'neutral'; suffix?: string }) {
  const display = typeof value === 'number' ? value.toLocaleString() : String(value || '')
  const deltaStr = typeof delta === 'number' ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : ''
  const color = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500'
  return (
    <div className="bg-white border border-slate-200 rounded p-4">
      <div className="text-sm text-slate-600">{title}</div>
      <div className="text-xl font-semibold text-slate-900 tabular-nums">{display}{suffix}</div>
      {deltaStr && <div className={`text-xs ${color}`}>{deltaStr}</div>}
    </div>
  )
}
