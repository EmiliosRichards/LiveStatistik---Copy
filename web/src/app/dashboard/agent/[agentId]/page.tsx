'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { tableBase, theadBase, tbodyBase, thBase, tdBase, trBase, containerBase } from '@/components/DataTable'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useAutoHideHeader } from '@/lib/useAutoHideHeader'
import { fetchAgents, fetchProjects, fetchProjectsForAgents, fetchStatistics } from '@/lib/api'
import type { Project } from '@/lib/api'
import { Users, Layers, HelpCircle, Bell, User, ChevronDown, Volume2, FileText, StickyNote, Copy, ArrowLeft, ArrowRight, CalendarClock, Download } from 'lucide-react'

// Normalize notes text: convert literal "\\n" (and "\\r\\n") sequences into real line breaks
function normalizeNotes(text: string): string {
  return text.replace(/\\r\\n|\\n|\\r/g, '\n')
}

type AgentMap = Record<string, string>
type ProjectMap = Record<string, string>

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [agentName, setAgentName] = useState('')
  const [currentProjects, setCurrentProjects] = useState<Project[]>([])
  const [pastProjects, setPastProjects] = useState<Project[]>([])
  const [newProjects, setNewProjects] = useState<Project[]>([])
  const [activeProjects, setActiveProjects] = useState<Project[]>([])
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([])
  const [allAgentIds, setAllAgentIds] = useState<string[]>([])
  const [currentIdx, setCurrentIdx] = useState<number>(-1)
  const [agentsMap, setAgentsMap] = useState<AgentMap>({})
  const [projectsMap, setProjectsMap] = useState<ProjectMap>({})
  const [campStats, setCampStats] = useState<any[]>([])
  const [campView, setCampView] = useState<'overview'|'details'>('overview')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<'date'|'name'>('date')
  const showHeader = useAutoHideHeader(24, 24)
  const headerRef = useRef<HTMLElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const recalc = () => { if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight || 0) }
    recalc(); window.addEventListener('resize', recalc); return () => window.removeEventListener('resize', recalc)
  }, [])
  const formatAgentName = (name: string) => name.replace(/\./g, ' ')

  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const timeFrom = searchParams.get('timeFrom') || undefined
  const timeTo = searchParams.get('timeTo') || undefined

  // Build display strings without placeholder dashes
  const dateRangeText = (dateFrom && dateTo)
    ? `${dateFrom} → ${dateTo}`
    : (dateFrom ? dateFrom : (dateTo ? dateTo : ''))
  const timeRangeText = (timeFrom || timeTo)
    ? `${timeFrom || '00:00'}–${timeTo || '23:59'}`
    : ''

  // header visibility handled by hook

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [agents, projects] = await Promise.all([fetchAgents(), fetchProjects()])
        if (cancelled) return
        const aMap: AgentMap = {}; agents.forEach(a => aMap[a.id] = a.name)
        const pMap: ProjectMap = {}; projects.forEach(p => pMap[p.id] = p.name)
        setAgentsMap(aMap)
        setProjectsMap(pMap)
        setAgentName(formatAgentName(aMap[agentId] || agentId))
        const selected = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('agents')
        const list = selected ? selected.split(',') : [agentId]
        setAllAgentIds(list)
        setCurrentIdx(list.findIndex(id => id === agentId))

        const proj = await fetchProjectsForAgents([agentId])
        if (cancelled) return
        // Group by sheet status if available, fallback to isActive
        const hasStatus = proj.some((p:any) => !!(p as any).status)
        if (hasStatus) {
          const pNew = proj.filter((p:any) => p.status === 'new')
          const pActive = proj.filter((p:any) => p.status === 'active')
          const pArchived = proj.filter((p:any) => p.status === 'archived')
          setNewProjects(pNew)
          setActiveProjects(pActive)
          setArchivedProjects(pArchived)
          // Keep legacy lists empty to avoid duplicate sections
          setCurrentProjects([])
          setPastProjects([])
        } else {
        setCurrentProjects(proj.filter(p => p.isActive))
        setPastProjects(proj.filter(p => !p.isActive))
          setNewProjects([])
          setActiveProjects([])
          setArchivedProjects([])
        }

        // Load aggregated campaign statistics for this agent
        try {
          const stats = await fetchStatistics({ agentIds: [agentId], dateFrom, dateTo, timeFrom, timeTo })
          const agg = new Map<string, { calls:number; completed:number; success:number; wz:number; gz:number; nbz:number; vbz:number; az:number }>()
          ;(stats as any[]).forEach((s:any) => {
            const key = s.projectId
            const a = agg.get(key) || { calls:0, completed:0, success:0, wz:0, gz:0, nbz:0, vbz:0, az:0 }
            a.calls += s.anzahl || 0
            a.completed += s.abgeschlossen || 0
            a.success += s.erfolgreich || 0
            a.wz += s.wartezeit || 0
            a.gz += s.gespraechszeit || 0
            a.nbz += s.nachbearbeitungszeit || 0
            a.vbz += s.vorbereitungszeit || 0
            a.az += s.arbeitszeit || 0
            agg.set(key, a)
          })
          // names and status
          const nameById: Record<string,string> = { ...projectsMap }
          ;(proj as any[]).forEach((p:any)=>{ if (!nameById[p.id]) nameById[p.id] = p.name })
          const statusById: Record<string, string|undefined> = {}
          ;(proj as any[]).forEach((p:any)=>{ statusById[p.id] = p.status })
          const rows: any[] = Array.from(agg.entries()).map(([projectId,a])=>({
            projectId,
            projectName: (nameById[projectId] || projectsMap[projectId] || projectId).replace(/^Project\s*/,'') ,
            status: statusById[projectId],
            totalCalls: a.calls,
            reachRate: a.calls ? (a.completed / a.calls) * 100 : 0,
            outcomes: a.success,
            avgDuration: a.completed ? (a.gz / a.completed) / 60 : 0,
            totalCompleted: a.completed,
            totalSuccess: a.success,
            wz: a.wz, gz: a.gz, nbz: a.nbz, vbz: a.vbz, az: a.az,
            erfolgProStunde: a.az ? a.success / a.az : 0
          }))
          // include projects with zero stats
          ;(proj as any[]).forEach((p:any)=>{
            if (!agg.has(p.id)) rows.push({
              projectId: p.id,
              projectName: (nameById[p.id] || p.name).replace(/^Project\s*/,'') ,
              status: p.status,
              totalCalls: 0, reachRate: 0, outcomes: 0, avgDuration: 0,
              totalCompleted: 0, totalSuccess: 0, wz:0, gz:0, nbz:0, vbz:0, az:0, erfolgProStunde:0
            })
          })
          rows.sort((a,b)=>a.projectName.localeCompare(b.projectName))
          setCampStats(rows)
        } catch(e) {
          setCampStats([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [agentId, dateFrom, dateTo, timeFrom, timeTo])

  const backToResults = () => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    router.push(`/dashboard?agents=${agentId}${params.get('dateFrom') ? `&dateFrom=${params.get('dateFrom')}` : ''}${params.get('dateTo') ? `&dateTo=${params.get('dateTo')}` : ''}${params.get('timeFrom') ? `&timeFrom=${params.get('timeFrom')}` : ''}${params.get('timeTo') ? `&timeTo=${params.get('timeTo')}` : ''}`)
  }

  // Extract a date from campaign name like "29.04.2025", "29.04.25", "09.25", or "29.04"
  const getProjectDateFromName = (name: string): number => {
    if (!name) return 0
    const s = String(name)
    // dd.mm.yyyy
    let m = s.match(/(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{4})/)
    if (m) {
      const d = parseInt(m[1], 10); const mo = parseInt(m[2], 10) - 1; const y = parseInt(m[3], 10)
      const dt = new Date(y, mo, d)
      return dt.getTime() || 0
    }
    // dd.mm.yy -> 20yy
    m = s.match(/(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{2})(?!\d)/)
    if (m) {
      const d = parseInt(m[1], 10); const mo = parseInt(m[2], 10) - 1; const y = 2000 + parseInt(m[3], 10)
      const dt = new Date(y, mo, d)
      return dt.getTime() || 0
    }
    // mm.yy -> 20yy, day 1
    m = s.match(/(\d{1,2})[\.\/-](\d{2})(?!\d)/)
    if (m) {
      const mo = parseInt(m[1], 10) - 1; const y = 2000 + parseInt(m[2], 10)
      const dt = new Date(y, mo, 1)
      return dt.getTime() || 0
    }
    // dd.mm -> current year
    m = s.match(/(\d{1,2})[\.\/-](\d{1,2})(?![\.\/-]\d)/)
    if (m) {
      const d = parseInt(m[1], 10); const mo = parseInt(m[2], 10) - 1; const y = new Date().getFullYear()
      const dt = new Date(y, mo, d)
      return dt.getTime() || 0
    }
    return 0
  }

  const sortedCampStats = useMemo(() => {
    const statusOrder: Record<string, number> = { new: 0, active: 1, archived: 2 }
    const list = campStats.slice()
    list.sort((a,b) => {
      const sa = statusOrder[String(a.status||'')] ?? 3
      const sb = statusOrder[String(b.status||'')] ?? 3
      if (sa !== sb) return sa - sb
      if (sortMode === 'name') {
        return String(a.projectName).localeCompare(String(b.projectName))
      }
      const da = getProjectDateFromName(String(a.projectName))
      const db = getProjectDateFromName(String(b.projectName))
      return db - da // recent first
    })
    return list
  }, [campStats, sortMode])

  const navigateRelative = (delta: number) => {
    if (currentIdx < 0 || allAgentIds.length === 0) return
    const nextIdx = (currentIdx + delta + allAgentIds.length) % allAgentIds.length
    const nextId = allAgentIds[nextIdx]
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    router.push(`/dashboard/agent/${nextId}?${params.toString()}`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      {/* Header */}
      <header ref={headerRef} className={`bg-white border-b border-border app-header sticky top-0 z-10 transition-transform duration-300 ${showHeader ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="w-full px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-3">
              <a href="/dashboard" className="inline-flex items-center" aria-label="Manuav Internal App">
                <img src="/Manuav-web-site-LOGO.png" alt="Manuav" className="h-8 w-auto invert" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Help" className="p-2 rounded hover:bg-slate-100" data-testid="button-help">
              <HelpCircle className="w-5 h-5 text-slate-700" />
            </button>
            <button aria-label="Notifications" className="relative p-2 rounded hover:bg-slate-100" data-testid="button-notifications">
              <Bell className="w-5 h-5 text-slate-700" />
              <span className="absolute -top-0.5 -right-0.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-red-500 text-white">1</span>
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button aria-label="Account" className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100" data-testid="button-account">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-4 h-4 text-slate-600" />
              </div>
              <span className="hidden sm:inline text-sm text-slate-700">Emilios</span>
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button className="text-sm text-slate-600 hover:text-slate-900" data-testid="button-language-de">DE</button>
            <span className="text-slate-300">|</span>
            <button className="text-sm text-slate-600 hover:text-slate-900" data-testid="button-language-en">EN</button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full px-6 py-8">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 sticky self-start" style={{ top: showHeader ? headerHeight : 0, marginTop: showHeader ? 0 : -headerHeight }}>
            <div className="bg-bg-elevated rounded-lg shadow-md p-2">
              <nav className="space-y-1 text-slate-800">
                <button
                  className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2"
                  onClick={() => { const sp = new URLSearchParams(); sp.set('view','dashboard'); router.push(`/dashboard?${sp.toString()}`) }}
                >
                  <Layers className="w-4 h-4" /> Dashboard
                </button>
                <button
                  className={`w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2 bg-slate-100 font-semibold border-l-4 border-blue-600`}
                  onClick={() => { router.push(`/dashboard?view=agents`) }}
                >
                  <Users className="w-4 h-4" /> Agents
                </button>
                <button
                  className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 flex items-center gap-2"
                  onClick={() => { router.push(`/dashboard?view=campaigns`) }}
                >
                  <Layers className="w-4 h-4" /> Campaigns
                </button>
                <button
                  className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-slate-800"
                  onClick={() => router.push('/dashboard/search')}
                >
                  <span className="inline-flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Time-based Search</span>
                </button>
              </nav>
            </div>
          </aside>

          {/* Content */}
          <section className="flex-1">
            <div className="bg-bg-elevated rounded-lg shadow-lg p-6 relative">
              {/* Prev/Next controls */}
              <button
                className="absolute left-4 top-4 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white/90 hover:bg-slate-50 text-slate-700 shadow-sm"
                onClick={() => navigateRelative(-1)}
              >
                <ArrowLeft className="w-4 h-4" /> Prev
              </button>
              <button
                className="absolute right-4 top-4 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white/90 hover:bg-slate-50 text-slate-700 shadow-sm"
                onClick={() => navigateRelative(1)}
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>

              <div className="mb-10 flex items-center justify-center">
                <h1 className="text-xl font-semibold text-slate-900">{agentName}</h1>
              </div>
              {(dateRangeText || timeRangeText) && (
              <div className="flex items-center justify-center mb-4 text-sm text-slate-600">
                  {dateRangeText && <span>{dateRangeText}</span>}
                  {timeRangeText && (
                    <>
                      {dateRangeText && <span className="mx-1">·</span>}
                      <span>{timeRangeText}</span>
                    </>
                  )}
              </div>
              )}

              {loading ? (
                <div className="text-slate-600">Loading…</div>
              ) : (currentProjects.length + pastProjects.length + newProjects.length + activeProjects.length + archivedProjects.length === 0) ? (
                <div className="text-slate-600">No projects found for this agent in the selected period.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">Campaigns</h2>
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center rounded border border-slate-300 overflow-hidden">
                        <button className={`px-3 py-1 text-sm ${campView==='overview'?'bg-slate-900 text-white':'hover:bg-slate-50 text-slate-700'}`} onClick={()=>setCampView('overview')}>Overview</button>
                        <div className="w-px h-5 bg-slate-300" />
                        <button className={`px-3 py-1 text-sm ${campView==='details'?'bg-slate-900 text-white':'hover:bg-slate-50 text-slate-700'}`} onClick={()=>setCampView('details')}>Details</button>
                      </div>
                      <label className="text-sm text-slate-700">Sort</label>
                      <select value={sortMode} onChange={e=>setSortMode(e.target.value as any)} className="border border-slate-300 rounded px-2 py-1 text-sm">
                        <option value="date">Date (recent)</option>
                        <option value="name">Name (A–Z)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className={containerBase}>
                      <table className={tableBase}>
                        {campView==='overview' ? (
                          <colgroup>
                            <col style={{ width: '30%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '14%' }} />
                          </colgroup>
                        ) : (
                          <colgroup>
                            <col style={{ width: '25%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '7%' }} />
                            <col style={{ width: '12%' }} />
                          </colgroup>
                        )}
                        <thead className={theadBase}>
                          {campView==='overview' ? (
                            <tr>
                              <th className={`${thBase} text-left`}>Campaign</th>
                              <th className={`${thBase} text-right`}>Total Calls</th>
                              <th className={`${thBase} text-right`}>Reach %</th>
                              <th className={`${thBase} text-right`}>Positive Outcomes</th>
                              <th className={`${thBase} text-right`}>Avg Duration (min)</th>
                              <th className={`${thBase} text-right`}>Status</th>
                            </tr>
                          ) : (
                            <tr>
                              <th className={`${thBase} text-left`}>Campaign</th>
                              <th className={`${thBase} text-right`}>Anzahl</th>
                              <th className={`${thBase} text-right`}>abgeschlossen</th>
                              <th className={`${thBase} text-right`}>erfolgreich</th>
                              <th className={`${thBase} text-right`}>WZ (h)</th>
                              <th className={`${thBase} text-right`}>GZ (h)</th>
                              <th className={`${thBase} text-right`}>NBZ (h)</th>
                              <th className={`${thBase} text-right`}>VBZ (h)</th>
                              <th className={`${thBase} text-right`}>Erfolg/h</th>
                              <th className={`${thBase} text-right`}>AZ (h)</th>
                              <th className={`${thBase} text-right`}>Status</th>
                            </tr>
                          )}
                        </thead>
                        <tbody className={tbodyBase}>
                          {sortedCampStats.map((row)=> (
                            <Fragment key={row.projectId}>
                              <tr className={trBase}>
                                <td className={`${tdBase} text-blue-700`}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <button className="text-slate-500 hover:text-slate-700" onClick={(e)=>{e.stopPropagation(); setExpandedId(expandedId===row.projectId?null:row.projectId)}} aria-label="Show calls">{expandedId===row.projectId? '▾' : '▸'}</button>
                                    <span className="truncate">{row.projectName}</span>
                    </div>
                                </td>
                                {campView==='overview' ? (
                                  <>
                                    <td className={`${tdBase} text-right font-semibold`}>{row.totalCalls.toLocaleString()}</td>
                                    <td className={`${tdBase} text-right`}><span className={`text-sm font-medium ${row.reachRate>=70?'text-green-600':'text-amber-600'}`}>{row.reachRate.toFixed(1)}%</span></td>
                                    <td className={`${tdBase} text-right font-semibold`}>{row.outcomes.toLocaleString()}</td>
                                    <td className={`${tdBase} text-right font-semibold`}>{row.avgDuration.toFixed(2)}</td>
                                    <td className={`${tdBase} text-right`}>
                                      {row.status && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${row.status==='active'?'bg-emerald-50 text-emerald-700 border-emerald-200': row.status==='new'?'bg-blue-50 text-blue-700 border-blue-200':'bg-slate-50 text-slate-600 border-slate-200'}`}>{row.status}</span>
                                      )}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className={`${tdBase} text-right font-semibold`}>{row.totalCalls.toLocaleString()}</td>
                                    <td className={`${tdBase} text-right font-semibold`}>{row.totalCompleted.toLocaleString()}</td>
                                    <td className={`${tdBase} text-right font-semibold`}>{row.totalSuccess.toLocaleString()}</td>
                                    <td className={`${tdBase} text-right font-semibold`}>{(row.wz/1).toFixed(2)}</td>
                                    <td className={`${tdBase} text-right font-semibold`}>{(row.gz/1).toFixed(2)}</td>
                                    <td className={`${tdBase} text-right font-semibold`}>{(row.nbz/1).toFixed(2)}</td>
                                    <td className={`${tdBase} text-right font-semibold`}>{(row.vbz/1).toFixed(2)}</td>
                                    <td className={`${tdBase} text-right font-semibold`}>{(row.erfolgProStunde/1).toFixed(2)}</td>
                                    <td className={`${tdBase} text-right font-semibold`}>{(row.az/1).toFixed(2)}</td>
                                    <td className={`${tdBase} text-right`}>
                                      {row.status && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${row.status==='active'?'bg-emerald-50 text-emerald-700 border-emerald-200': row.status==='new'?'bg-blue-50 text-blue-700 border-blue-200':'bg-slate-50 text-slate-600 border-slate-200'}`}>{row.status}</span>
                                      )}
                                    </td>
                                  </>
                                )}
                              </tr>
                              {expandedId===row.projectId && (
                                <tr key={`${row.projectId}-expanded`}>
                                  <td colSpan={campView==='overview'?6:11} className="px-0">
                                    <ProjectPanel embedded agentId={agentId} projectId={row.projectId} projectName={row.projectName} dateFrom={dateFrom} dateTo={dateTo} timeFrom={timeFrom} timeTo={timeTo} />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                          {sortedCampStats.length===0 && (
                            <tr><td colSpan={campView==='overview'?6:11} className="text-center py-8 text-slate-500">No campaigns for the selected range.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    </div>
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

type ProjectPanelProps = {
  agentId: string
  projectId: string
  projectName: string
  dateFrom?: string
  dateTo?: string
  timeFrom?: string
  timeTo?: string
  embedded?: boolean
}

function ProjectPanel(props: ProjectPanelProps) {
  const [open, setOpen] = useState(!!props.embedded)
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<any | null>(null)
  const [serverTotal, setServerTotal] = useState<number | null>(null)
  const [serverGrouped, setServerGrouped] = useState<null | { negativ: Record<string, number>; positiv: Record<string, number>; offen: Record<string, number> }>(null)
  const [view, setView] = useState<'overview'|'details'>('details')
  const [selectedCategory, setSelectedCategory] = useState<null | 'positiv' | 'negativ' | 'offen'>(null)
  const [selectedSub, setSelectedSub] = useState<string | null>(null)
  const [filterCalls, setFilterCalls] = useState<'alle' | 'mit_audio' | 'mit_transkript' | 'mit_notizen'>('alle')
  const [filterTime, setFilterTime] = useState<'alle' | 'heute' | 'woche' | 'monat'>('alle')
  const [page, setPage] = useState(1)
  const pageSize = 200

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (props.dateFrom) p.append('dateFrom', props.dateFrom)
    if (props.dateTo) p.append('dateTo', props.dateTo)
    if (props.timeFrom) p.append('timeFrom', props.timeFrom)
    if (props.timeTo) p.append('timeTo', props.timeTo)
    return p.toString()
  }, [props.dateFrom, props.dateTo, props.timeFrom, props.timeTo])

  const loadCalls = async () => {
    setLoading(true)
    try {
      // fetch paged slice and totals
      const url = `/api/call-details-paged/${props.agentId}/${props.projectId}?${query}&page=${page}&pageSize=${pageSize}`
      const res = await fetch(url, { credentials: 'include' })
      if (res.ok) {
        const payload = await res.json()
        if (Array.isArray(payload?.items)) setCalls(payload.items)
        if (typeof payload?.total === 'number') setServerTotal(Number(payload.total))
        // Build synthetic stats from grouped totals if available
        if (payload?.grouped) {
          setServerGrouped(payload.grouped as any)
          const sum = (obj: Record<string, number>) => Object.values(obj || {}).reduce((acc: number, n: any) => acc + Number(n || 0), 0)
          const total = sum(payload.grouped.positiv||{}) + sum(payload.grouped.negativ||{}) + sum(payload.grouped.offen||{})
          setStats({
            anzahl: total,
            abgeschlossen: sum(payload.grouped.negativ||{}) + sum(payload.grouped.positiv||{}),
            erfolgreich: sum(payload.grouped.positiv||{}),
            gespraechszeit: 0,
            arbeitszeit: 0
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && calls.length === 0) loadCalls()
  }, [open])

  useEffect(() => { setPage(1) }, [selectedCategory, selectedSub, filterCalls, filterTime])
  useEffect(() => { if (open) setPage(1) }, [open])

  // Derived: grouping by category/subcategory (prefer server totals if available)
  const grouped = useMemo(() => {
    if (serverGrouped) return serverGrouped
    const map: Record<'negativ'|'positiv'|'offen', Record<string, number>> = { negativ: {}, positiv: {}, offen: {} }
    calls.forEach(c => {
      const cat: 'negativ'|'positiv'|'offen' = (String(c.outcomeCategory || 'offen').toLowerCase().includes('neg') ? 'negativ' : String(c.outcomeCategory || 'offen').toLowerCase().includes('pos') ? 'positiv' : 'offen')
      const key = c.outcome || '—'
      map[cat][key] = (map[cat][key] || 0) + 1
    })
    return map
  }, [calls, serverGrouped])

  const filteredCalls = useMemo(() => {
    let list = calls.slice()
    // category filter
    if (selectedCategory) {
      list = list.filter(c => {
        const cat = String(c.outcomeCategory || 'offen').toLowerCase()
        if (selectedCategory === 'negativ') return cat.includes('neg')
        if (selectedCategory === 'positiv') return cat.includes('pos')
        return !(cat.includes('neg') || cat.includes('pos'))
      })
      if (selectedSub) list = list.filter(c => (c.outcome || '—') === selectedSub)
    }
    // call filters
    if (filterCalls === 'mit_audio') list = list.filter(c => !!c.recordingUrl)
    if (filterCalls === 'mit_transkript') list = list.filter(c => !!c.transcript)
    if (filterCalls === 'mit_notizen') list = list.filter(c => !!c.notes)
    // time filters
    const now = new Date()
    if (filterTime !== 'alle') {
      list = list.filter(c => {
        const d = new Date(c.callStart)
        if (filterTime === 'heute') {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          return d >= today
        }
        if (filterTime === 'woche') {
          const first = new Date(now)
          const day = now.getDay() || 7
          first.setDate(now.getDate() - day + 1)
          first.setHours(0,0,0,0)
          return d >= first
        }
        if (filterTime === 'monat') {
          const first = new Date(now.getFullYear(), now.getMonth(), 1)
          return d >= first
        }
        return true
      })
    }
    return list
  }, [calls, selectedCategory, selectedSub, filterCalls, filterTime])

  const pageCount = filteredCalls.length
  const overallTotal = serverTotal ?? pageCount
  const totalPages = Math.max(1, Math.ceil(overallTotal / pageSize))
  const startIdx = (page - 1) * pageSize
  const endIdx = Math.min(startIdx + pageSize, overallTotal)
  const visibleCalls = filteredCalls.slice(startIdx, endIdx)

  const inner = (
        <div className="px-4 pb-4">
          {/* Stats summary under project name */}
          {stats && (
            <div className="rounded border border-slate-200 bg-slate-50 p-3 mb-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div><div className="text-slate-700">Anzahl</div><div className="font-semibold tabular-nums">{stats.anzahl?.toLocaleString?.() || 0}</div></div>
                <div><div className="text-slate-700">abgeschlossen</div><div className="font-semibold tabular-nums">{stats.abgeschlossen || 0}</div></div>
                <div><div className="text-slate-700">erfolgreich</div><div className="font-semibold tabular-nums">{stats.erfolgreich || 0}</div></div>
                <div><div className="text-slate-700">GZ (h)</div><div className="font-semibold tabular-nums">{(stats.gespraechszeit || 0).toFixed(2)}</div></div>
                <div><div className="text-slate-700">AZ (h)</div><div className="font-semibold tabular-nums">{(stats.arbeitszeit || 0).toFixed(2)}</div></div>
              </div>
            </div>
          )}

          {/* Category columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
            {(['negativ','positiv','offen'] as const).map(col => (
              <div key={col} className={`rounded border p-3 ${col==='negativ' ? 'border-red-200 bg-red-50' : col==='positiv' ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}>
                <div className="flex items-center justify-between mb-2 text-sm">
                  <div className="font-semibold capitalize text-slate-900">{col}</div>
                      <div className="text-slate-900">{Object.values(grouped[col]).reduce((a,b)=>a+(b as number),0)}</div>
                </div>
                <div className="space-y-1">
                  {Object.entries(grouped[col]).slice(0,12).map(([name,count]) => (
                    <button key={name} className={`w-full flex items-center justify-between text-left text-xs rounded px-2 py-1 hover:bg-white/70 text-slate-800 ${selectedCategory===col && selectedSub===name ? 'bg-white' : ''}`} onClick={() => { setSelectedCategory(col); setSelectedSub(name) }}>
                      <span className="truncate" title={name}>{name}</span>
                      <span className="font-medium">{count as number}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Filters and controls */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm">
              <label className="text-slate-600">Anrufe</label>
              <select className="border border-slate-300 rounded px-2 py-1" value={filterCalls} onChange={e=>setFilterCalls(e.target.value as any)}>
                <option value="alle">Alle Anrufe</option>
                <option value="mit_audio">Mit Audio</option>
                <option value="mit_transkript">Mit Transkript</option>
                <option value="mit_notizen">Mit Notizen</option>
              </select>
              <label className="text-slate-600 ml-4">Zeiten</label>
              <select className="border border-slate-300 rounded px-2 py-1" value={filterTime} onChange={e=>setFilterTime(e.target.value as any)}>
                <option value="alle">Alle Zeiten</option>
                <option value="heute">Heute</option>
                <option value="woche">Diese Woche</option>
                <option value="monat">Dieser Monat</option>
              </select>
            </div>
              <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded border border-slate-300 overflow-hidden">
                <button
                  className={`px-3 py-1 text-sm ${view === 'overview' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                  onClick={() => setView('overview')}
                >
                  Overview
                </button>
                <div className="w-px h-5 bg-slate-300" />
                <button
                  className={`px-3 py-1 text-sm ${view === 'details' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                  onClick={() => setView('details')}
                >
                  Details
                </button>
              </div>
                <div className="text-sm text-slate-800 hidden sm:block font-semibold">{overallTotal.toLocaleString()} Ergebnisse</div>
                <div className="flex items-center gap-2 text-sm text-slate-800">
                  <button
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border font-medium ${page===1 ? 'text-slate-300 border-slate-200' : 'text-slate-800 bg-white border-slate-500 hover:bg-slate-50'}`}
                    disabled={page===1}
                    onClick={()=>setPage(p=>Math.max(1,p-1))}
                    aria-label="Previous page"
                  >
                    <ArrowLeft className="w-4 h-4" /> Prev
                  </button>
                  <span className="px-1 tabular-nums font-medium">{startIdx+1}–{endIdx} / {overallTotal.toLocaleString()}</span>
                  <button
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border font-medium ${page===totalPages ? 'text-slate-300 border-slate-200' : 'text-slate-800 bg-white border-slate-500 hover:bg-slate-50'}`}
                    disabled={page===totalPages}
                    onClick={()=>setPage(p=>Math.min(totalPages,p+1))}
                    aria-label="Next page"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                  <span className="px-2">Page</span>
                  <select className="border border-slate-400 rounded px-2 py-1 text-sm text-slate-800" value={page} onChange={e=>setPage(parseInt(e.target.value)||1)}>
                    {Array.from({length: totalPages}, (_,i)=>i+1).slice(0,500).map(n=> (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <span className="px-1 font-medium">/ {totalPages}</span>
                </div>
            </div>
          </div>
          {loading ? (
            <div className="p-4 text-slate-600">Loading calls…</div>
          ) : calls.length === 0 ? (
            <div className="p-4 text-slate-600">No calls found.</div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="py-2 px-3 text-left">Nr</th>
                    <th className="py-2 px-3 text-left">Datum</th>
                    <th className="py-2 px-3 text-left">Zeit</th>
                    <th className="py-2 px-3 text-left">Dauer</th>
                    <th className="py-2 px-3 text-left">Audio Download</th>
                    <th className="py-2 px-3 text-left">Firmenname</th>
                    <th className="py-2 px-3 text-left">Ansprechpartner</th>
                    <th className="py-2 px-3 text-center">A</th>
                    <th className="py-2 px-3 text-center">T</th>
                    <th className="py-2 px-3 text-center">N</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {view==='details' && visibleCalls.map((c, idx) => (
                    <CallRow key={c.id || (startIdx+idx)} index={startIdx+idx+1} call={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
  )

  if (props.embedded) {
    return inner
  }
  return (
    <div className="border-y border-slate-200">
      <button className="w-full text-left px-4 py-3 flex items-center justify-between" onClick={() => setOpen(!open)}>
        <div>
          <div className="text-sm text-slate-700">Project</div>
          <div className="text-base font-medium text-slate-900">{props.projectName}</div>
        </div>
        <span className="text-slate-500 text-sm">{open ? 'Hide' : 'Show'} calls</span>
      </button>
      {open && inner}
    </div>
  )
}

function ProjectSummary({ calls }: { calls: any[] }) {
  if (!calls || calls.length === 0) return null
  const totals = calls.reduce((acc, c) => {
    const cat = c.outcomeCategory || 'offen'
    acc.total += 1
    acc[cat] = (acc[cat] || 0) as number + 1
    return acc
  }, { total: 0, positive: 0, negative: 0, offen: 0 } as any)

  // Outcome counts by detail (like KI Gatekeeper etc.)
  const byDetail = new Map<string, number>()
  calls.forEach(c => {
    const key = c.outcome || 'Unknown'
    byDetail.set(key, (byDetail.get(key) || 0) + 1)
  })

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3 mb-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="font-medium text-slate-800">Summary</div>
        <div className="text-slate-700">Total: {totals.total}</div>
        <div className="text-emerald-700">Positive: {totals.positive}</div>
        <div className="text-amber-700">Open: {totals.offen}</div>
        <div className="text-red-700">Negative: {totals.negative}</div>
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {Array.from(byDetail.entries()).slice(0, 15).map(([label, count]) => (
          <div key={label} className="text-xs text-slate-700 flex items-center justify-between bg-white border border-slate-200 rounded px-2 py-1">
            <span>{label}</span>
            <span className="font-medium">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CallRow({ call, index }: { call: any; index: number }) {
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAudio, setShowAudio] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  const startTranscription = async () => {
    if (!call.recordingUrl) {
      setError('No recording URL available')
      return
    }
    setError(null)
    setTranscribing(true)
    try {
      const submit = await fetch(`/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ audioUrl: call.recordingUrl })
      })
      if (!submit.ok) throw new Error('Failed to submit transcription')
      const { audioFileId } = await submit.json()
      // poll status briefly here for UX; production could offload
      const max = 6
      for (let i = 0; i < max; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const statusRes = await fetch(`/api/transcribe/${audioFileId}/status`, { credentials: 'include' })
        if (!statusRes.ok) continue
        const status = await statusRes.json()
        if (status.status === 'completed' && status.transcript) {
          setTranscript(status.transcript)
          break
        }
        if (status.status === 'failed') {
          setError(status?.metadata?.error || 'Transcription failed')
          break
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Transcription error')
    } finally {
      setTranscribing(false)
    }
  }

  const dt = new Date(call.callStart)
  const datum = isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString()
  const zeit = isNaN(dt.getTime()) ? '—' : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dauerSec = Math.round(call.duration || 0)
  const dauer = `${Math.floor(dauerSec/60)}:${(dauerSec%60).toString().padStart(2,'0')}`
  const firm = call.companyName || call.contactName || '—'
  const person = call.contactPerson || '—'

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="py-2 px-3 text-slate-700 tabular-nums">{index}</td>
        <td className="py-2 px-3 text-slate-700">{datum}</td>
        <td className="py-2 px-3 text-slate-700">{zeit}</td>
        <td className="py-2 px-3 text-slate-700 tabular-nums">{dauer}</td>
        <td className="py-2 px-3">
          {call.recordingUrl ? (
            <a
              href={call.recordingUrl}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center justify-center w-9 h-8 text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
              aria-label="Download audio file"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </a>
          ) : (
            <span className="inline-flex items-center justify-center w-9 h-8 text-slate-300 border border-slate-200 rounded cursor-not-allowed" title="No audio">
              <Download className="w-4 h-4" />
            </span>
          )}
        </td>
        <td className="py-2 px-3 text-slate-800">{firm}</td>
        <td className="py-2 px-3 text-slate-600">{person}</td>
        <td className="py-2 px-3 text-center">
          <button className={`p-1 rounded ${call.recordingUrl ? 'hover:bg-slate-100 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`} onClick={() => call.recordingUrl && setShowAudio(v=>!v)}><Volume2 className="w-4 h-4" /></button>
        </td>
        <td className="py-2 px-3 text-center">
          <button className={`p-1 rounded hover:bg-slate-100 ${transcribing ? 'text-slate-300' : 'text-slate-700'}`} onClick={startTranscription} disabled={transcribing}><FileText className="w-4 h-4" /></button>
        </td>
        <td className="py-2 px-3 text-center">
          <button className={`p-1 rounded ${call.notes ? 'hover:bg-slate-100 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`} onClick={() => call.notes && setShowNotes(v=>!v)}><StickyNote className="w-4 h-4" /></button>
        </td>
      </tr>
      {(showAudio && call.recordingUrl) && (
        <tr>
          <td colSpan={10} className="px-3 pb-3">
            <audio controls src={call.recordingUrl} className="h-8" />
          </td>
        </tr>
      )}
      {error && (
        <tr><td colSpan={10} className="px-3 text-sm text-red-600">{error}</td></tr>
      )}
      {transcript && (
        <tr><td colSpan={10} className="px-3">
          <div className="text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded p-3 whitespace-pre-wrap">{transcript}</div>
        </td></tr>
      )}
      {(showNotes && call.notes) && (
        <tr><td colSpan={10} className="px-3">
          <div className="text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded p-3 whitespace-pre-wrap">{normalizeNotes(String(call.notes))}</div>
        </td></tr>
      )}
    </>
  )
}



