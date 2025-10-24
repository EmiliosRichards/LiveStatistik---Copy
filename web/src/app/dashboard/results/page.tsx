'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { StatisticsTable } from '@/components/StatisticsTable'
import { fetchStatistics, fetchAgents, fetchProjects, type Statistics } from '@/lib/api'
import { HelpCircle, Bell, User, ChevronDown, AlertTriangle } from 'lucide-react'

export default function ResultsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [statistics, setStatistics] = useState<Statistics[]>([])
  const [agents, setAgents] = useState<Record<string, string>>({})
  const [projects, setProjects] = useState<Record<string, string>>({})
  const [view, setView] = useState<'overview'|'details'>('overview')
  const [missingAgents, setMissingAgents] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // Check for pre-fetched data in sessionStorage
        const cacheKey = searchParams.get('cache')
        if (cacheKey) {
          try {
            const cached = sessionStorage.getItem(cacheKey)
            if (cached) {
              const parsed = JSON.parse(cached) as { statistics: Statistics[]; agents: any[]; projects: any[] }
              const aMap: Record<string, string> = {}; parsed.agents.forEach((a: any) => aMap[a.id] = a.name)
              const pMap: Record<string, string> = {}; parsed.projects.forEach((p: any) => pMap[p.id] = p.name)
              setAgents(aMap); setProjects(pMap); setStatistics(parsed.statistics)
              // Compute missing agents
              const selectedIds = (searchParams.get('agents')?.split(',') || []).filter(Boolean)
              if (selectedIds.length > 0) {
                const present = new Set(parsed.statistics.map((s: any) => s.agentId))
                const missing = selectedIds.filter((id: string) => !present.has(id)).map((id: string) => aMap[id] || id)
                setMissingAgents(missing)
              } else {
                setMissingAgents([])
              }
              setLoading(false)
              return
            }
          } catch {}
        }

        // Fallback: fetch here
        const agentIds = searchParams.get('agents')?.split(',') || []
        const projectIds = searchParams.get('projects')?.split(',')
        const dateFrom = searchParams.get('dateFrom') || undefined
        const dateTo = searchParams.get('dateTo') || undefined
        const timeFrom = searchParams.get('timeFrom') || undefined
        const timeTo = searchParams.get('timeTo') || undefined
        const [stats, aList, pList] = await Promise.all([
          fetchStatistics({ agentIds, projectIds, dateFrom, dateTo, timeFrom, timeTo }),
          fetchAgents(),
          fetchProjects()
        ])
        const aMap: Record<string, string> = {}; aList.forEach(a => aMap[a.id] = a.name)
        const pMap: Record<string, string> = {}; pList.forEach(p => pMap[p.id] = p.name)
        setAgents(aMap); setProjects(pMap); setStatistics(stats)
        const selectedIds = (searchParams.get('agents')?.split(',') || []).filter(Boolean)
        if (selectedIds.length > 0) {
          const present = new Set(stats.map(s => s.agentId))
          const missing = selectedIds.filter(id => !present.has(id)).map(id => aMap[id] || id)
          setMissingAgents(missing)
        } else {
          setMissingAgents([])
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [searchParams])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-slate-100">
      {/* Header (same style as dashboard) */}
      <header className="bg-white border-b border-border app-header sticky top-0 z-10">
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

      {/* Warning banner for missing agents */}
      {missingAgents.length > 0 && (
        <div className="mx-6 mt-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-4 py-2 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            The following agents have no campaigns in the selected period:
            <span className="font-medium">{missingAgents.join(', ')}</span>
          </div>
        </div>
      )}

      <main className="flex-1 w-full px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Statistics Results</h1>
        <div className="flex items-center justify-between mb-4">
          <a href="/dashboard" className="text-sm text-slate-800 hover:underline underline-offset-2">← Back to search</a>
          <div className="flex items-center gap-2">
            <button className={`px-3 py-1 text-sm ${view==='overview'?'bg-slate-900 text-white':'hover:bg-slate-50 text-slate-700'}`} onClick={()=>setView('overview')}>Overview</button>
            <button className={`px-3 py-1 text-sm ${view==='details'?'bg-slate-900 text-white':'hover:bg-slate-50 text-slate-700'}`} onClick={()=>setView('details')}>Details</button>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          {loading ? (
            <div className="text-slate-600">Loading…</div>
          ) : statistics.length === 0 ? (
            <div className="text-slate-600">No statistics for the selected filters.</div>
          ) : (
            <StatisticsTable statistics={statistics} agents={agents} projects={projects} view={view} />
          )}
        </div>
      </main>
    </div>
  )
}


