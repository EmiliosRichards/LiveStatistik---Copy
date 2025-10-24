'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { fetchAgents, fetchProjects, fetchStatistics, type Statistics } from '@/lib/api'
import { Users, Layers, HelpCircle, Bell, User, ChevronDown, CalendarClock } from 'lucide-react'

export default function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [showHeader, setShowHeader] = useState(true)
  const [campaignName, setCampaignName] = useState('')
  const [agentStats, setAgentStats] = useState<Array<{ agentId: string; agentName: string; stats: Statistics[] }>>([])

  useEffect(() => {
    let lastY = 0
    const onScroll = () => {
      const y = window.scrollY || 0
      if (y <= 0) { setShowHeader(true); lastY = 0; return }
      if (y - lastY > 5) setShowHeader(false)
      else if (lastY - y > 5) setShowHeader(true)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const dateFrom = searchParams.get('dateFrom') || undefined
        const dateTo = searchParams.get('dateTo') || undefined
        const timeFrom = searchParams.get('timeFrom') || undefined
        const timeTo = searchParams.get('timeTo') || undefined

        const [agents, projects, stats] = await Promise.all([
          fetchAgents(),
          fetchProjects(),
          fetchStatistics({ agentIds: [], projectIds: [campaignId], dateFrom, dateTo, timeFrom, timeTo })
        ])
        if (cancelled) return

        const p = projects.find(p => p.id === campaignId)
        setCampaignName(p?.name || campaignId)

        // group stats by agent
        const byAgent = new Map<string, Statistics[]>()
        stats.forEach(s => {
          const list = byAgent.get(s.agentId) || []
          list.push(s)
          byAgent.set(s.agentId, list)
        })

        const aMap = new Map(agents.map(a => [a.id, a.name] as const))
        setAgentStats(Array.from(byAgent.entries()).map(([agentId, list]) => ({ agentId, agentName: aMap.get(agentId) || agentId, stats: list })))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [campaignId, searchParams])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-slate-100">
      {/* Header */}
      <header className={`bg-white border-b border-border app-header sticky top-0 z-10 transition-transform duration-300 ${showHeader ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-3">
              <a href="/dashboard" className="inline-flex items-center" aria-label="Manuav Internal App">
                <img src="/Manuav-web-site-LOGO.png" alt="Manuav" className="h-8 w-auto invert" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Help" className="p-2 rounded hover:bg-slate-100"><HelpCircle className="w-5 h-5 text-slate-700" /></button>
            <button aria-label="Notifications" className="relative p-2 rounded hover:bg-slate-100"><Bell className="w-5 h-5 text-slate-700" /><span className="absolute -top-0.5 -right-0.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-red-500 text-white">1</span></button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button aria-label="Account" className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100"><div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center"><User className="w-4 h-4 text-slate-600" /></div><span className="hidden sm:inline text-sm text-slate-700">Emilios</span><ChevronDown className="w-4 h-4 text-slate-500" /></button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button className="text-sm text-slate-600 hover:text-slate-900">DE</button>
            <span className="text-slate-300">|</span>
            <button className="text-sm text-slate-600 hover:text-slate-900">EN</button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full px-6 py-8">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 sticky top-24 self-start">
            <div className="bg-white rounded-lg shadow border border-slate-200 p-2">
              <nav className="space-y-1 text-slate-800">
                <button className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2" onClick={() => { const sp = new URLSearchParams(); sp.set('view','dashboard'); router.push(`/dashboard?${sp.toString()}`) }}>
                  <Layers className="w-4 h-4" /> Dashboard
                </button>
                <button className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2" onClick={() => { router.push(`/dashboard?view=agents`) }}>
                  <Users className="w-4 h-4" /> Agents
                </button>
                <button className={`w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2 bg-slate-100 font-semibold border-l-4 border-blue-600`} onClick={() => { router.push(`/dashboard?view=campaigns`) }}>
                  <Layers className="w-4 h-4" /> Campaigns
                </button>
                <button className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-slate-800" onClick={() => router.push('/dashboard/search')}>
                  <span className="inline-flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Time-based Search</span>
                </button>
              </nav>
            </div>
          </aside>

          {/* Content */}
          <section className="flex-1">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-xl font-semibold text-slate-900">{campaignName}</h1>
              </div>

              {loading ? (
                <div className="text-slate-600">Loading…</div>
              ) : agentStats.length === 0 ? (
                <div className="text-slate-600">No agents found for this campaign.</div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {agentStats.map(({ agentId, agentName, stats }) => {
                    const totals = stats.reduce((acc, s) => {
                      acc.anzahl += s.anzahl
                      acc.abgeschlossen += s.abgeschlossen
                      acc.erfolgreich += s.erfolgreich
                      acc.gz += s.gespraechszeit
                      acc.az += s.arbeitszeit
                      return acc
                    }, { anzahl: 0, abgeschlossen: 0, erfolgreich: 0, gz: 0, az: 0 })
                    return (
                      <div key={agentId} className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="text-slate-900 font-medium">{agentName}</div>
                          <a className="text-blue-600 hover:underline text-sm" href={`/dashboard/agent/${agentId}?${searchParams.toString()}`}>View agent</a>
                        </div>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                          <div><div className="text-slate-500">Anzahl</div><div className="font-semibold tabular-nums">{totals.anzahl}</div></div>
                          <div><div className="text-slate-500">abgeschlossen</div><div className="font-semibold tabular-nums">{totals.abgeschlossen}</div></div>
                          <div><div className="text-slate-500">erfolgreich</div><div className="font-semibold tabular-nums">{totals.erfolgreich}</div></div>
                          <div><div className="text-slate-500">GZ (h)</div><div className="font-semibold tabular-nums">{totals.gz.toFixed(2)}</div></div>
                          <div><div className="text-slate-500">AZ (h)</div><div className="font-semibold tabular-nums">{totals.az.toFixed(2)}</div></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="w-full px-6 py-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-slate-600">Database: Connected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-slate-600">Dialfire API: Connected</span>
              </div>
            </div>
            <span className="text-slate-400">v1.0 • Internal Preview</span>
          </div>
        </div>
      </footer>
    </div>
  )
}


