'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Phone, TrendingUp, CheckCircle, Clock, Users, Layers, Search as SearchIcon, CalendarClock, Calendar, Briefcase, Sparkles, Activity, Archive, Circle, ChevronDown } from 'lucide-react'
import { StatisticsTable } from '@/components/StatisticsTable'
import { type Statistics, type Agent as AgentType, type Project as ProjectType } from '@/lib/api'
import { InlineCalendar } from '@/components/InlineCalendar'
import { CallsTimeSeriesChart } from '@/components/CallsTimeSeriesChart'
import { OutcomesBarChart } from '@/components/OutcomesBarChart'
import { format } from 'date-fns'

interface KPIData {
  totalCalls: number
  reachRate: number
  positiveOutcomes: number
  avgDuration: number
}

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [statsView, setStatsView] = useState<'overview' | 'details'>('overview')
  const initialSection = (searchParams.get('view') as 'dashboard' | 'agents' | 'campaigns' | 'search') || 'dashboard'
  const [section, setSection] = useState<'dashboard' | 'agents' | 'campaigns' | 'search'>(initialSection)
  const [agentsList, setAgentsList] = useState<AgentType[]>([])
  const [campaignsList, setCampaignsList] = useState<ProjectType[]>([])
  const [campaignSearchQuery, setCampaignSearchQuery] = useState('')
  const [campaignSort, setCampaignSort] = useState<'date_desc' | 'date_asc' | 'name_asc' | 'name_desc'>('name_asc')
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'active' | 'new' | 'archived'>('all')
  const [agentSearchQuery, setAgentSearchQuery] = useState('')
  const [globalKpis, setGlobalKpis] = useState<any | null>(null)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [statistics, setStatistics] = useState<Statistics[]>([])
  const [agents, setAgents] = useState<Record<string, string>>({})
  const [projects, setProjects] = useState<Record<string, string>>({})
  const [missingAgents, setMissingAgents] = useState<string[]>([])
  const [showMissingModal, setShowMissingModal] = useState(false)

  const hasSearchParams = searchParams.get('dateFrom') && (searchParams.get('agents') || searchParams.get('projects'))
  
  // Fetch global company-wide KPIs on mount
  useEffect(() => {
    const fetchKPIs = async () => {
      try {
        setKpiLoading(true)
        const response = await fetch('/api/kpis')
        if (!response.ok) {
          throw new Error(`KPI fetch failed: ${response.status} ${response.statusText}`)
        }
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text()
          throw new Error(`Expected JSON but got: ${text.substring(0, 100)}`)
        }
        const data = await response.json()
        setGlobalKpis(data)
      } catch (error) {
        console.error('Failed to fetch KPIs:', error)
      } finally {
        setKpiLoading(false)
      }
    }
    fetchKPIs()
  }, [])

  const goToAgent = (agentId: string) => {
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete('view')
    try { sessionStorage.setItem('dashboard:lastAgentId', agentId) } catch {}
    router.push(`/dashboard/agent/${agentId}?${sp.toString()}`)
  }

  const goToCampaign = (campaignId: string) => {
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete('view')
    router.push(`/dashboard/campaign/${campaignId}?${sp.toString()}`)
  }

  // Admin redirect helper (to be used later for admin link)
  const goToAdminCampaigns = () => {
    router.push('/dashboard/campaigns-admin')
  }
  
  // Serialize all params to trigger refetch when any param changes
  const paramsString = searchParams.toString()

  // header visibility handled by hook

  useEffect(() => {
    if (hasSearchParams) {
      fetchStatistics()
    }
  }, [paramsString])

  // Load agents/campaigns on demand and restore persisted UI state
  const campaignsStateLoaded = useRef(false)
  useEffect(() => {
    const load = async () => {
      if (section === 'agents') {
        const { fetchAgents } = await import('@/lib/api')
        const data = await fetchAgents()
        setAgentsList(data)
        // Auto-return to last viewed agent unless suppressed once
        try {
          const suppress = sessionStorage.getItem('dashboard:suppressAutoAgentOnce')
          if (suppress === '1') {
            sessionStorage.removeItem('dashboard:suppressAutoAgentOnce')
          } else {
            const last = sessionStorage.getItem('dashboard:lastAgentId')
            if (last) {
              const sp = new URLSearchParams(searchParams.toString())
              sp.delete('view')
              router.push(`/dashboard/agent/${last}?${sp.toString()}`)
              return
            }
          }
        } catch {}
      }
      if (section === 'campaigns') {
        const { fetchProjects } = await import('@/lib/api')
        const data = await fetchProjects()
        setCampaignsList(data)
        if (!campaignsStateLoaded.current) {
          try {
            const raw = sessionStorage.getItem('dashboard:campaigns:state')
            if (raw) {
              const s = JSON.parse(raw) as { q?: string; sort?: string; filter?: string }
              if (typeof s.q === 'string') setCampaignSearchQuery(s.q)
              if (s.sort === 'date_desc' || s.sort === 'date_asc' || s.sort === 'name_asc' || s.sort === 'name_desc') setCampaignSort(s.sort)
              if (s.filter === 'all' || s.filter === 'active' || s.filter === 'new' || s.filter === 'archived') setCampaignFilter(s.filter)
            }
          } catch {}
          campaignsStateLoaded.current = true
        }
      }
    }
    load()
  }, [section])

  // Persist campaign filters while viewing the campaigns section
  useEffect(() => {
    if (section !== 'campaigns') return
    try {
      const payload = JSON.stringify({ q: campaignSearchQuery, sort: campaignSort, filter: campaignFilter })
      sessionStorage.setItem('dashboard:campaigns:state', payload)
    } catch {}
  }, [section, campaignSearchQuery, campaignSort, campaignFilter])

  // Extract date from campaign name like "... 22.04.25" or "... 22.04.2025"
  const getProjectDateFromName = (name: string): number => {
    const match = name.match(/(\d{1,2})[.](\d{1,2})[.](\d{2,4})\b/)
    if (!match) return 0
    let [ , dd, mm, yy ] = match
    const day = parseInt(dd, 10)
    const month = parseInt(mm, 10) - 1
    let year = parseInt(yy, 10)
    if (yy.length === 2) year += year >= 70 ? 1900 : 2000
    const d = new Date(year, month, day)
    if (isNaN(d.getTime())) return 0
    return d.getTime()
  }

  const visibleCampaigns = campaignsList
    .filter(c => campaignSearchQuery.trim() === '' || c.name.toLowerCase().includes(campaignSearchQuery.toLowerCase()))
    .filter(c => campaignFilter === 'all' ? true : (c.status === campaignFilter || (campaignFilter === 'active' && (c.status === 'active' || c.status === 'new'))))
    .sort((a, b) => {
      if (campaignSort === 'name_asc') return a.name.localeCompare(b.name)
      if (campaignSort === 'name_desc') return b.name.localeCompare(a.name)
      const aTime = getProjectDateFromName(a.name)
      const bTime = getProjectDateFromName(b.name)
      if (campaignSort === 'date_asc') return aTime - bTime
      return bTime - aTime
    })

  const groupedCampaigns: Record<'active'|'new'|'archived'|'unknown', typeof visibleCampaigns> = {
    active: [], new: [], archived: [], unknown: []
  }
  visibleCampaigns.forEach(c => {
    const s = (c.status || 'unknown') as 'active'|'new'|'archived'|'unknown'
    if (s === 'new') groupedCampaigns.new.push(c)
    else if (s === 'active') groupedCampaigns.active.push(c)
    else if (s === 'archived') groupedCampaigns.archived.push(c)
    else groupedCampaigns.unknown.push(c)
  })

  const fetchStatistics = async () => {
    setLoading(true)
    try {
      const agentIds = searchParams.get('agents')?.split(',') || []
      const projectIds = searchParams.get('projects')?.split(',')
      const dateFrom = searchParams.get('dateFrom')
      const dateTo = searchParams.get('dateTo')
      const timeFrom = searchParams.get('timeFrom')
      const timeTo = searchParams.get('timeTo')

      const { fetchStatistics: fetchStats, fetchAgents, fetchProjects } = await import('@/lib/api')
      
      // Fetch all data in parallel
      const [stats, agentList, projectList] = await Promise.all([
        fetchStats({
          agentIds,
          projectIds,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          timeFrom: timeFrom || undefined,
          timeTo: timeTo || undefined
        }),
        fetchAgents(),
        fetchProjects()
      ])

      // Build name maps
      const agentMap: Record<string, string> = {}
      agentList.forEach(a => { agentMap[a.id] = a.name })
      setAgents(agentMap)

      const projectMap: Record<string, string> = {}
      projectList.forEach(p => { projectMap[p.id] = p.name })
      setProjects(projectMap)

      setStatistics(stats)

      // Missing agent notification: any selected agent with zero stats
      if (agentIds.length > 0) {
        const presentAgentIds = new Set(stats.map(s => s.agentId))
        const missing = agentIds.filter(id => !presentAgentIds.has(id)).map(id => agentMap[id] || id)
        setMissingAgents(missing)
        setShowMissingModal(missing.length > 0)
      } else {
        setMissingAgents([])
        setShowMissingModal(false)
      }

      // Don't calculate KPIs here anymore - we use global KPIs
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
    } finally {
      setLoading(false)
    }
  }

  // Do not early-return; show the new layout and an inline empty state instead

  return (
    <div className="flex-1 w-full px-6 py-8 flex flex-col">
        {/* View state script no longer required; using React state */}
        {/* Layout: Sidebar + Content */}
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 sticky self-start top-0">
            <div className="bg-bg-elevated rounded-lg shadow-md p-2">
              <nav className="space-y-1 text-slate-800">
                <Link
                  href={`/dashboard?${(() => { const sp = new URLSearchParams(searchParams.toString()); sp.set('view','dashboard'); return sp.toString() })()}`}
                  onClick={() => setSection('dashboard')}
                  className={`block w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2 ${section==='dashboard' ? 'bg-slate-100 font-semibold border-l-4 border-blue-600' : ''}`}
                  data-testid="link-dashboard"
                >
                  <Layers className="w-4 h-4" /> Dashboard
                </Link>
                <Link
                  href={`/dashboard?${(() => { const sp = new URLSearchParams(searchParams.toString()); sp.set('view','agents'); return sp.toString() })()}`}
                  onClick={() => { sessionStorage.setItem('dashboard:suppressAutoAgentOnce','1'); setSection('agents') }}
                  className={`block w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2 ${section==='agents' ? 'bg-slate-100 font-semibold border-l-4 border-blue-600' : ''}`}
                  data-testid="link-agents"
                >
                  <Users className="w-4 h-4" /> Agents
                </Link>
                <Link
                  href={`/dashboard?${(() => { const sp = new URLSearchParams(searchParams.toString()); sp.set('view','campaigns'); return sp.toString() })()}`}
                  onClick={() => setSection('campaigns')}
                  className={`block w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2 ${section==='campaigns' ? 'bg-slate-100 font-semibold border-l-4 border-blue-600' : ''}`}
                  data-testid="link-campaigns"
                >
                  <Layers className="w-4 h-4" /> Campaigns
                </Link>
                <Link
                  href={`/dashboard?${(() => { const sp = new URLSearchParams(searchParams.toString()); sp.set('view','search'); return sp.toString() })()}`}
                  onClick={() => setSection('search')}
                  className={`block w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2 ${section==='search' ? 'bg-slate-100 font-semibold border-l-4 border-blue-600' : ''}`}
                  data-testid="link-search"
                >
                  <CalendarClock className="w-4 h-4" /> Time-based Search
                </Link>
              </nav>
            </div>
          </aside>

          {/* Content */}
          <section className="flex-1">
        {/* Missing agents modal */}
        {showMissingModal && missingAgents.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowMissingModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <div className="text-lg font-semibold mb-2">No projects found</div>
              <div className="text-sm text-slate-600 mb-4">No projects found for the specified time frame for the following agents:</div>
              <ul className="list-disc pl-5 text-sm text-slate-700 max-h-48 overflow-auto mb-4">
                {missingAgents.map(name => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 text-sm rounded bg-slate-100 hover:bg-slate-200" onClick={() => setShowMissingModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
        {section==='dashboard' && (loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-bg-elevated rounded-lg p-6 shadow-md animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-24 mb-4"></div>
                <div className="h-8 bg-slate-200 rounded w-32 mb-2"></div>
                <div className="h-3 bg-slate-200 rounded w-20"></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-bg-elevated rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow" data-testid="card-total-calls">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base font-semibold text-slate-700">Total Calls This Week</span>
                  <Phone className="w-5 h-5 text-blue-500" />
                </div>
                {kpiLoading ? (
                  <div className="animate-pulse">
                    <div className="h-8 bg-slate-200 rounded w-24 mb-1"></div>
                    <div className="h-3 bg-slate-200 rounded w-20"></div>
                  </div>
                ) : globalKpis ? (
                  <>
                    <div className="text-3xl font-bold text-slate-900 mb-1">{globalKpis.totalCalls.value.toLocaleString()}</div>
                    <div className={`text-xs ${globalKpis.totalCalls.trend === 'up' ? 'text-green-600' : 'text-orange-600'}`}>
                      {globalKpis.totalCalls.trend === 'up' ? '+' : ''}{globalKpis.totalCalls.comparison}% vs. last week
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-bold text-slate-900 mb-1">0</div>
                    <div className="text-xs text-slate-500">No data</div>
                  </>
                )}
              </div>

              <div className="bg-bg-elevated rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow" data-testid="card-reach-rate">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base font-semibold text-slate-700">Reach Rate</span>
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </div>
                {kpiLoading ? (
                  <div className="animate-pulse">
                    <div className="h-8 bg-slate-200 rounded w-24 mb-1"></div>
                    <div className="h-3 bg-slate-200 rounded w-20"></div>
                  </div>
                ) : globalKpis ? (
                  <>
                    <div className="text-3xl font-bold text-slate-900 mb-1">{globalKpis.reachRate.value}%</div>
                    <div className={`text-xs ${globalKpis.reachRate.trend === 'up' ? 'text-green-600' : 'text-orange-600'}`}>
                      {globalKpis.reachRate.trend === 'up' ? '+' : ''}{globalKpis.reachRate.comparison}% vs. last week
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-bold text-slate-900 mb-1">0%</div>
                    <div className="text-xs text-slate-500">No data</div>
                  </>
                )}
              </div>

              <div className="bg-bg-elevated rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow" data-testid="card-positive-outcomes">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base font-semibold text-slate-700">Positive Outcomes</span>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                {kpiLoading ? (
                  <div className="animate-pulse">
                    <div className="h-8 bg-slate-200 rounded w-24 mb-1"></div>
                    <div className="h-3 bg-slate-200 rounded w-20"></div>
                  </div>
                ) : globalKpis ? (
                  <>
                    <div className="text-3xl font-bold text-slate-900 mb-1">{globalKpis.positiveOutcomes.value}</div>
                    <div className={`text-xs ${globalKpis.positiveOutcomes.trend === 'up' ? 'text-green-600' : 'text-orange-600'}`}>
                      {globalKpis.positiveOutcomes.trend === 'up' ? '+' : ''}{globalKpis.positiveOutcomes.comparison}% vs. last week
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-bold text-slate-900 mb-1">0</div>
                    <div className="text-xs text-slate-500">No data</div>
                  </>
                )}
              </div>

              <div className="bg-bg-elevated rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow" data-testid="card-avg-duration">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base font-semibold text-slate-700">Avg. Call Duration</span>
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
                {kpiLoading ? (
                  <div className="animate-pulse">
                    <div className="h-8 bg-slate-200 rounded w-24 mb-1"></div>
                    <div className="h-3 bg-slate-200 rounded w-20"></div>
                  </div>
                ) : globalKpis ? (
                  <>
                    <div className="text-3xl font-bold text-slate-900 mb-1">{globalKpis.avgDuration.value} min</div>
                    <div className={`text-xs ${globalKpis.avgDuration.trend === 'up' ? 'text-green-600' : 'text-orange-600'}`}>
                      {globalKpis.avgDuration.trend === 'up' ? '+' : ''}{globalKpis.avgDuration.comparison}% vs. last week
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-bold text-slate-900 mb-1">0 min</div>
                    <div className="text-xs text-slate-500">No data</div>
                  </>
                )}
              </div>
            </div>

            {/* Statistics Table */}
            <div className="bg-bg-elevated rounded-lg shadow-lg hover:shadow-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Dashboard</h2>
                  {(() => {
                    const df = searchParams.get('dateFrom') || undefined
                    const dt = searchParams.get('dateTo') || undefined
                    const tf = searchParams.get('timeFrom') || undefined
                    const tt = searchParams.get('timeTo') || undefined
                    const datePart = df && dt && df !== dt ? `${df} - ${dt}` : (df || dt)
                    const timePart = (tf || tt) ? ` · ${tf || '00:00'}–${tt || '23:59'}` : ''
                    const label = datePart ? `${datePart}${timePart}` : ''
                    return label ? <span className="text-xs text-slate-500">({label})</span> : null
                  })()}
                </div>
                <div className="flex items-center gap-3">
                  {/* View toggle */}
                  <ViewToggle view={statsView} onChange={setStatsView} />
                  <button className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" data-testid="button-export-csv">
                    Export CSV
                  </button>
                </div>
              </div>
              {/* Charts showing performance metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CallsTimeSeriesChart />
                <OutcomesBarChart />
              </div>
            </div>
          </>
        ))}

        {/* Agents view */}
        {section==='agents' && (
          <div className="bg-bg-elevated rounded-lg shadow-lg hover:shadow-xl p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">Agents</h2>
              <div className="relative w-full max-w-xs">
                <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={agentSearchQuery}
                  onChange={(e)=>setAgentSearchQuery(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                />
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-700 bg-slate-50">
                  <tr>
                    <th className="text-left py-2 px-3">Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agentsList
                    .filter(a => {
                      const displayName = (a.name || '').replace(/\./g, ' ')
                      return agentSearchQuery.trim() === '' || displayName.toLowerCase().includes(agentSearchQuery.toLowerCase())
                    })
                    .map(a => {
                      const displayName = (a.name || '').replace(/\./g, ' ')
                      return (
                        <tr key={a.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => goToAgent(a.id)}>
                          <td className="py-2 px-3 text-slate-900 underline-offset-2 hover:underline">{displayName}</td>
                        </tr>
                      )
                    })}
                  {agentsList.length === 0 && (
                    <tr><td className="py-6 px-3 text-slate-500" colSpan={1}>No agents loaded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Campaigns view */}
        {section==='campaigns' && (
          <div className="space-y-6">
            {/* Header and filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Campaigns</h2>
                  <p className="text-sm text-slate-600 mt-1">{campaignsList.length} total campaigns</p>
                </div>
                
                {/* Filter Chips */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCampaignFilter('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      campaignFilter === 'all' 
                        ? 'bg-slate-900 text-white shadow-md' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    All <span className="ml-1 opacity-70">({campaignsList.length})</span>
                  </button>
                  <button
                    onClick={() => setCampaignFilter('new')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1.5 ${
                      campaignFilter === 'new' 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    New <span className="ml-0.5 opacity-70">({groupedCampaigns.new.length})</span>
                  </button>
                  <button
                    onClick={() => setCampaignFilter('active')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1.5 ${
                      campaignFilter === 'active' 
                        ? 'bg-emerald-600 text-white shadow-md' 
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    Active <span className="ml-0.5 opacity-70">({groupedCampaigns.active.length})</span>
                  </button>
                  <button
                    onClick={() => setCampaignFilter('archived')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1.5 ${
                      campaignFilter === 'archived' 
                        ? 'bg-slate-600 text-white shadow-md' 
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archived <span className="ml-0.5 opacity-70">({groupedCampaigns.archived.length})</span>
                  </button>
                </div>
              </div>

              {/* Search and Sort */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={campaignSearchQuery}
                    onChange={(e)=>setCampaignSearchQuery(e.target.value)}
                    placeholder="Search campaigns..."
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
                <select
                  value={campaignSort}
                  onChange={(e)=>setCampaignSort(e.target.value as any)}
                  className="border border-slate-300 rounded-lg text-sm px-3 py-2.5 text-slate-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                >
                  <option value="date_desc">📅 Newest First</option>
                  <option value="date_asc">📅 Oldest First</option>
                  <option value="name_asc">🔤 A → Z</option>
                  <option value="name_desc">🔤 Z → A</option>
                </select>
              </div>
            </div>

            {/* Campaigns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* New Campaigns */}
              {(campaignFilter === 'all' || campaignFilter === 'new' || campaignFilter === 'active') && groupedCampaigns.new.map(c => (
                <button
                  key={c.id}
                  onClick={() => goToCampaign(c.id)}
                  className="group bg-white rounded-lg border-2 border-blue-200 p-4 hover:border-blue-400 hover:shadow-lg transition-all text-left relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-100 to-transparent rounded-bl-full opacity-50" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2 flex-1">
                        {c.name}
                      </h3>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-300 shrink-0">
                        <Sparkles className="w-3 h-3" />
                        New
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Circle className="w-2 h-2 fill-blue-500 text-blue-500" />
                      <span>Recently added</span>
                    </div>
                  </div>
                </button>
              ))}

              {/* Active Campaigns */}
              {(campaignFilter === 'all' || campaignFilter === 'active') && groupedCampaigns.active.map(c => (
                <button
                  key={c.id}
                  onClick={() => goToCampaign(c.id)}
                  className="group bg-white rounded-lg border-2 border-emerald-200 p-4 hover:border-emerald-400 hover:shadow-lg transition-all text-left relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-emerald-100 to-transparent rounded-bl-full opacity-50" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-2 flex-1">
                        {c.name}
                      </h3>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300 shrink-0">
                        <Activity className="w-3 h-3" />
                        Active
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500 animate-pulse" />
                      <span>Running</span>
                    </div>
                  </div>
                </button>
              ))}

              {/* Archived Campaigns */}
              {(campaignFilter === 'all' || campaignFilter === 'archived') && groupedCampaigns.archived.map(c => (
                <button
                  key={c.id}
                  onClick={() => goToCampaign(c.id)}
                  className="group bg-white rounded-lg border-2 border-slate-200 p-4 hover:border-slate-300 hover:shadow-md transition-all text-left relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-slate-100 to-transparent rounded-bl-full opacity-30" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-slate-700 group-hover:text-slate-900 transition-colors line-clamp-2 flex-1">
                        {c.name}
                      </h3>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300 shrink-0">
                        <Archive className="w-3 h-3" />
                        Archived
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Circle className="w-2 h-2 fill-slate-400 text-slate-400" />
                      <span>Inactive</span>
                    </div>
                  </div>
                </button>
              ))}

              {/* Unknown Campaigns */}
              {(campaignFilter === 'all') && groupedCampaigns.unknown.map(c => (
                <button
                  key={c.id}
                  onClick={() => goToCampaign(c.id)}
                  className="group bg-white rounded-lg border-2 border-slate-200 p-4 hover:border-slate-400 hover:shadow-md transition-all text-left"
                >
                  <h3 className="font-semibold text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-2">
                    {c.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
                    <Circle className="w-2 h-2 fill-slate-300 text-slate-300" />
                    <span>Status unknown</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Empty State */}
            {campaignsList.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-lg">No campaigns loaded yet.</p>
              </div>
            )}

            {/* No Results State */}
            {campaignsList.length > 0 && 
             groupedCampaigns.new.length === 0 && 
             groupedCampaigns.active.length === 0 && 
             groupedCampaigns.archived.length === 0 && 
             groupedCampaigns.unknown.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                <SearchIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-lg">No campaigns match your filters.</p>
                <button
                  onClick={() => {
                    setCampaignFilter('all')
                    setCampaignSearchQuery('')
                  }}
                  className="mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Time-based Search view */}
        {section==='search' && (
          <TimeSearchView />
        )}
          </section>
        </div>

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

function ViewToggle({ view, onChange }: { view: 'overview' | 'details'; onChange: (v: 'overview' | 'details') => void }) {
  return (
    <div className="inline-flex items-center rounded border border-slate-300 overflow-hidden">
      <button
        className={`px-3 py-1 text-sm ${view === 'overview' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
        onClick={() => onChange('overview')}
      >
        Overview
      </button>
      <div className="w-px h-5 bg-slate-300" />
      <button
        className={`px-3 py-1 text-sm ${view === 'details' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
        onClick={() => onChange('details')}
      >
        Details
      </button>
    </div>
  )
}

function TimeSearchView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchType, setSearchType] = useState<'agent' | 'project'>('agent')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateFromDisplay, setDateFromDisplay] = useState('')
  const [dateToDisplay, setDateToDisplay] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [agents, setAgents] = useState<AgentType[]>([])
  const [projects, setProjects] = useState<ProjectType[]>([])
  const [agentSearch, setAgentSearch] = useState('')
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [projectFilter, setProjectFilter] = useState<'all'|'active'|'new'|'archived'>('all')

  const [showFromCal, setShowFromCal] = useState(false)
  const [showToCal, setShowToCal] = useState(false)
  const [fromMonth, setFromMonth] = useState<number>(new Date().getMonth())
  const [fromYear, setFromYear] = useState<number>(new Date().getFullYear())
  const [toMonth, setToMonth] = useState<number>(new Date().getMonth())
  const [toYear, setToYear] = useState<number>(new Date().getFullYear())
  const fromRef = useRef<HTMLDivElement | null>(null)
  const toRef = useRef<HTMLDivElement | null>(null)
  const agentRef = useRef<HTMLDivElement | null>(null)
  const projectRef = useRef<HTMLDivElement | null>(null)

  // Close calendars and dropdowns on outside click / Escape
  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (showFromCal && fromRef.current && target && !fromRef.current.contains(target)) {
        setShowFromCal(false)
      }
      if (showToCal && toRef.current && target && !toRef.current.contains(target)) {
        setShowToCal(false)
      }
      if (showAgentDropdown && agentRef.current && target && !agentRef.current.contains(target)) {
        setShowAgentDropdown(false)
      }
      if (showProjectDropdown && projectRef.current && target && !projectRef.current.contains(target)) {
        setShowProjectDropdown(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowFromCal(false)
        setShowToCal(false)
        setShowAgentDropdown(false)
        setShowProjectDropdown(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showFromCal, showToCal, showAgentDropdown, showProjectDropdown])

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    if (searchType === 'project') {
      loadAllProjects()
    }
  }, [searchType])

  const loadAgents = async () => {
    setLoadingAgents(true)
    try {
      const { fetchAgents } = await import('@/lib/api')
      const data = await fetchAgents()
      setAgents(data)
    } catch (error) {
      console.error('Failed to load agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }

  const loadProjectsForAgents = async () => {
    setLoadingProjects(true)
    try {
      const { fetchProjectsForAgents } = await import('@/lib/api')
      const data = await fetchProjectsForAgents(selectedAgents)
      setProjects(data)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoadingProjects(false)
    }
  }

  const loadAllProjects = async () => {
    setLoadingProjects(true)
    try {
      const { fetchProjects } = await import('@/lib/api')
      const data = await fetchProjects()
      setProjects(data)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoadingProjects(false)
    }
  }

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    )
  }

  const toggleProject = (projectId: string) => {
    setSelectedProjects(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
  }

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(agentSearch.toLowerCase())
  )

  const filteredProjects = projects.filter((p: any) => {
    if (projectFilter === 'all') return true
    if (projectFilter === 'active') return p.status === 'active' || p.status === 'new'
    return p.status === projectFilter
  })

  const isFormValid = dateFrom && dateTo && (
    (searchType === 'agent' && selectedAgents.length > 0) ||
    (searchType === 'project' && selectedProjects.length > 0)
  )

  const handleSearch = async () => {
    if (!isFormValid) return
    const params = new URLSearchParams({
      type: searchType,
      dateFrom,
      dateTo,
      ...(selectedAgents.length > 0 && { agents: selectedAgents.join(',') }),
      ...(selectedProjects.length > 0 && { projects: selectedProjects.join(',') })
    })
    try { sessionStorage.setItem('timeSearch:lastParams', params.toString()) } catch {}
    const cacheKey = `results:${Date.now()}`
    setSubmitting(true)
    try {
      const { fetchStatistics, fetchAgents, fetchProjects } = await import('@/lib/api')
      const agentIds = selectedAgents
      const projectIds = selectedProjects.length > 0 ? selectedProjects : undefined
      const [stats, aList, pList] = await Promise.all([
        fetchStatistics({ agentIds, projectIds, dateFrom, dateTo }),
        fetchAgents(),
        fetchProjects()
      ])
      const cachePayload = { statistics: stats, agents: aList, projects: pList }
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(cachePayload))
      } catch {}
      router.push(`/dashboard/results?${params.toString()}&cache=${encodeURIComponent(cacheKey)}`)
    } catch (e) {
      router.push(`/dashboard/results?${params.toString()}`)
    } finally {
      setSubmitting(false)
    }
  }

  const clearFilters = () => {
    setDateFrom(''); setDateTo('')
    setDateFromDisplay(''); setDateToDisplay('')
    setSelectedAgents([]); setSelectedProjects([])
    setAgentSearch('')
    try { sessionStorage.removeItem('timeSearch:lastParams') } catch {}
    try {
      const sp = new URLSearchParams(searchParams.toString())
      sp.delete('type'); sp.delete('dateFrom'); sp.delete('dateTo'); sp.delete('agents'); sp.delete('projects')
      router.replace(`/dashboard?${sp.toString()}`)
    } catch {}
  }

  const isoToDisplay = (iso: string) => {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${d.padStart(2,'0')} - ${m.padStart(2,'0')} - ${y}`
  }
  const displayToIso = (display: string): string => {
    const compact = display.replace(/\s+/g, '')
    const parts = compact.split('-')
    if (parts.length !== 3) return ''
    const [dd, mm, yyyy] = parts
    if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return ''
    const day = parseInt(dd, 10), mon = parseInt(mm, 10)
    if (isNaN(day) || isNaN(mon) || day < 1 || day > 31 || mon < 1 || mon > 12) return ''
    return `${yyyy}-${mm}-${dd}`
  }
  const dateToIsoLocal = (d: Date) => {
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const setQuickDate = (range: 'today' | 'week' | 'month') => {
    const today = new Date()
    const formatted = format(today, 'yyyy-MM-dd')
    switch (range) {
      case 'today':
        setDateFrom(formatted); setDateFromDisplay(isoToDisplay(formatted))
        setDateTo(formatted); setDateToDisplay(isoToDisplay(formatted))
        break
      case 'week':
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay())
        {
          const fromIso = format(weekStart, 'yyyy-MM-dd')
          setDateFrom(fromIso); setDateFromDisplay(isoToDisplay(fromIso))
          setDateTo(formatted); setDateToDisplay(isoToDisplay(formatted))
        }
        break
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        {
          const fromIso = format(monthStart, 'yyyy-MM-dd')
          setDateFrom(fromIso); setDateFromDisplay(isoToDisplay(fromIso))
          setDateTo(formatted); setDateToDisplay(isoToDisplay(formatted))
        }
        break
    }
  }

  // Initialize from URL or session cache
  useEffect(() => {
    const sp = searchParams
    const fromUrl = !!(sp.get('dateFrom') || sp.get('dateTo') || sp.get('agents') || sp.get('projects') || sp.get('type'))
    const params = fromUrl ? sp : (() => {
      try { const prev = typeof window !== 'undefined' ? sessionStorage.getItem('timeSearch:lastParams') : null; return prev ? new URLSearchParams(prev) : undefined } catch { return undefined }
    })()
    if (!params) return
    const t = params.get('type') as 'agent'|'project'|null
    if (t === 'agent' || t === 'project') setSearchType(t)
    const df = params.get('dateFrom') || ''
    const dt = params.get('dateTo') || ''
    if (df) { setDateFrom(df); setDateFromDisplay(isoToDisplay(df)) }
    if (dt) { setDateTo(dt); setDateToDisplay(isoToDisplay(dt)) }
    const a = params.get('agents')
    if (a) setSelectedAgents(a.split(',').filter(Boolean))
    const p = params.get('projects')
    if (p) setSelectedProjects(p.split(',').filter(Boolean))
  }, [searchParams])

  return (
    <div className="bg-bg-elevated rounded-lg shadow-lg p-8">
      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-slate-200">
        <button
          onClick={() => setSearchType('agent')}
          className={`pb-3 px-4 font-medium transition-colors relative ${
            searchType === 'agent' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Agent Data
          {searchType === 'agent' && (<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />)}
        </button>
        <button
          onClick={() => setSearchType('project')}
          className={`pb-3 px-4 font-medium transition-colors relative ${
            searchType === 'project' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Project Data
          {searchType === 'project' && (<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />)}
        </button>
      </div>

      {/* Form Fields */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="relative" ref={fromRef}>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Calendar className="inline w-4 h-4 mr-2" />
              From
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd - mm - yyyy"
              value={dateFromDisplay}
              onChange={(e) => { const v = e.target.value; setDateFromDisplay(v); const iso = displayToIso(v); if (iso) setDateFrom(iso) }}
              onBlur={() => { if (dateFrom) setDateFromDisplay(isoToDisplay(dateFrom)) }}
              onFocus={() => setShowFromCal(true)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 placeholder:text-slate-500"
            />
            {showFromCal && (
              <div className="absolute z-20 mt-2 w-full">
                <InlineCalendar
                  value={dateFrom ? new Date(dateFrom) : null}
                  onChange={(d) => { const iso = dateToIsoLocal(d); setDateFrom(iso); setDateFromDisplay(isoToDisplay(iso)); setShowFromCal(false) }}
                  visibleMonth={fromMonth}
                  visibleYear={fromYear}
                  onMonthChange={setFromMonth}
                  onYearChange={setFromYear}
                />
              </div>
            )}
          </div>
          <div className="relative" ref={toRef}>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Calendar className="inline w-4 h-4 mr-2" />
              To
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd - mm - yyyy"
              value={dateToDisplay}
              onChange={(e) => { const v = e.target.value; setDateToDisplay(v); const iso = displayToIso(v); if (iso) setDateTo(iso) }}
              onBlur={() => { if (dateTo) setDateToDisplay(isoToDisplay(dateTo)) }}
              onFocus={() => setShowToCal(true)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 placeholder:text-slate-500"
            />
            {showToCal && (
              <div className="absolute z-20 mt-2 w-full">
                <InlineCalendar
                  value={dateTo ? new Date(dateTo) : null}
                  onChange={(d) => { const iso = dateToIsoLocal(d); setDateTo(iso); setDateToDisplay(isoToDisplay(iso)); setShowToCal(false) }}
                  visibleMonth={toMonth}
                  visibleYear={toYear}
                  onMonthChange={setToMonth}
                  onYearChange={setToYear}
                />
              </div>
            )}
          </div>
        </div>

        {/* Quick Date Shortcuts */}
        <div className="flex gap-2">
          <button onClick={() => setQuickDate('today')} className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors">Today</button>
          <button onClick={() => setQuickDate('week')} className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors">This Week</button>
          <button onClick={() => setQuickDate('month')} className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors">This Month</button>
        </div>

        {/* Agent Selector */}
        {searchType === 'agent' && (
          <div className="relative" ref={agentRef}>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Users className="inline w-4 h-4 mr-2" />
              Select Agents
            </label>
            <button
              onClick={() => setShowAgentDropdown(!showAgentDropdown)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between hover:border-slate-400 transition-colors"
            >
              <span className="text-slate-700">{selectedAgents.length === 0 ? 'Choose agents...' : `${selectedAgents.length} agent${selectedAgents.length > 1 ? 's' : ''} selected`}</span>
              <ChevronDown className="w-5 h-5 text-slate-400" />
            </button>
            {showAgentDropdown && (
              <div className="absolute z-10 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col">
                <div className="p-3 border-b border-slate-200">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      placeholder="Search agents..."
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto max-h-60">
                  {loadingAgents ? (
                    <div className="p-4 text-sm text-slate-500 text-center">Loading agents...</div>
                  ) : filteredAgents.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500 text-center">No agents found</div>
                  ) : (
                    filteredAgents.map((agent) => (
                      <label key={agent.id} className="flex items-center px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors">
                        <input type="checkbox" checked={selectedAgents.includes(agent.id)} onChange={() => toggleAgent(agent.id)} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                        <span className="ml-3 text-sm text-slate-700">{agent.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Project Selector */}
        {searchType === 'project' && (
          <div className="relative" ref={projectRef}>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Briefcase className="inline w-4 h-4 mr-2" />
              Select Projects
            </label>
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between transition-colors hover:border-slate-400"
            >
              <span className="text-slate-700">{selectedProjects.length === 0 ? 'Choose projects...' : `${selectedProjects.length} project${selectedProjects.length > 1 ? 's' : ''} selected`}</span>
              <ChevronDown className="w-5 h-5 text-slate-400" />
            </button>
            {showProjectDropdown && (
              <div className="absolute z-10 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                <div className="sticky top-0 z-10 bg-white p-2 border-b border-slate-200 flex items-center gap-2 text-xs">
                  <span className="text-slate-600">Filter:</span>
                  <button className={`px-2 py-1 rounded ${projectFilter==='all'?'bg-slate-900 text-white':'hover:bg-slate-50'}`} onClick={()=>setProjectFilter('all')}>All</button>
                  <button className={`px-2 py-1 rounded ${projectFilter==='active'?'bg-emerald-600 text-white':'hover:bg-slate-50 text-emerald-700'}`} onClick={()=>setProjectFilter('active')}>Active</button>
                  <button className={`px-2 py-1 rounded ${projectFilter==='new'?'bg-blue-600 text-white':'hover:bg-slate-50 text-blue-700'}`} onClick={()=>setProjectFilter('new')}>New</button>
                  <button className={`px-2 py-1 rounded ${projectFilter==='archived'?'bg-slate-700 text-white':'hover:bg-slate-50 text-slate-700'}`} onClick={()=>setProjectFilter('archived')}>Archived</button>
                </div>
                {loadingProjects ? (
                  <div className="p-4 text-sm text-slate-500 text-center">Loading projects...</div>
                ) : filteredProjects.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 text-center">No projects available</div>
                ) : (
                  filteredProjects.map((project: any) => (
                    <label key={project.id} className="flex items-center px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors">
                      <input type="checkbox" checked={selectedProjects.includes(project.id)} onChange={() => toggleProject(project.id)} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                      <span className="ml-3 text-sm text-slate-700 inline-flex items-center gap-2">
                        <span>{project.name}</span>
                        {project.status && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border ${ project.status==='active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : project.status==='new' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200' }`}>
                            {project.status}
                          </span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search / Clear Buttons */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={clearFilters}
          className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
        >
          Clear
        </button>
        <button
          onClick={handleSearch}
          disabled={!isFormValid || submitting}
          className={`px-8 py-3 rounded-lg font-semibold transition-all ${
            isFormValid && !submitting
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
              Searching…
            </span>
          ) : (
            'Search Statistics'
          )}
        </button>
      </div>

      {/* Help Text */}
      <p className="text-center text-sm text-slate-500 mt-6">
        {searchType === 'agent' 
          ? 'Select at least one agent and a date range to view statistics'
          : 'Select at least one project and a date range to view statistics'}
      </p>
    </div>
  )
}
