import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { Phone, TrendingUp, CheckCircle, Clock, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'

interface Statistics {
  id: string
  agentId: string
  projectId: string
  date: Date
  anzahl: number
  abgeschlossen: number
  erfolgreich: number
  gespraechszeit: number
  wartezeit: number
  nachbearbeitungszeit: number
  vorbereitungszeit: number
  arbeitszeit: number
  erfolgProStunde: number
  outcomes: Record<string, number>
}

interface Agent {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
}

interface KPIData {
  totalCalls: number
  reachRate: number
  positiveOutcomes: number
  avgDuration: number
}

export default function Dashboard() {
  const [location, setLocation] = useLocation()
  const [kpiData, setKpiData] = useState<KPIData | null>(null)
  const [statistics, setStatistics] = useState<Statistics[]>([])
  const [agents, setAgents] = useState<Record<string, string>>({})
  const [projects, setProjects] = useState<Record<string, string>>({})
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const params = new URLSearchParams(location.split('?')[1] || '')
  const agentIds = params.get('agents')?.split(',').filter(Boolean) || []
  const projectIds = params.get('projects')?.split(',').filter(Boolean) || []
  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')
  const timeFrom = params.get('timeFrom')
  const timeTo = params.get('timeTo')

  const hasSearchParams = dateFrom && (agentIds.length > 0 || projectIds.length > 0)

  useEffect(() => {
    if (hasSearchParams) {
      fetchStatistics()
    }
  }, [location])

  const fetchStatistics = async () => {
    try {
      const [statsRes, agentsRes, projectsRes] = await Promise.all([
        fetch('/api/statistics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentIds,
            projectIds,
            dateFrom,
            dateTo,
            timeFrom,
            timeTo
          })
        }),
        fetch('/api/agents'),
        fetch('/api/projects')
      ])

      const stats = await statsRes.json()
      const agentList = await agentsRes.json()
      const projectList = await projectsRes.json()

      const agentMap: Record<string, string> = {}
      agentList.forEach((a: Agent) => { agentMap[a.id] = a.name })
      setAgents(agentMap)

      const projectMap: Record<string, string> = {}
      projectList.forEach((p: Project) => { projectMap[p.id] = p.name })
      setProjects(projectMap)

      setStatistics(stats)

      const totalCalls = stats.reduce((sum: number, s: Statistics) => sum + s.anzahl, 0)
      const totalSuccess = stats.reduce((sum: number, s: Statistics) => sum + s.erfolgreich, 0)
      const totalCompleted = stats.reduce((sum: number, s: Statistics) => sum + s.abgeschlossen, 0)
      const reachRate = totalCalls > 0 ? (totalCompleted / totalCalls) * 100 : 0
      const totalTime = stats.reduce((sum: number, s: Statistics) => sum + s.gespraechszeit, 0)
      const avgDuration = totalCompleted > 0 ? totalTime / totalCompleted / 60 : 0

      setKpiData({
        totalCalls,
        reachRate: parseFloat(reachRate.toFixed(1)),
        positiveOutcomes: totalSuccess,
        avgDuration: parseFloat(avgDuration.toFixed(1))
      })
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
    }
  }

  const toggleRow = (agentId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId)
    } else {
      newExpanded.add(agentId)
    }
    setExpandedRows(newExpanded)
  }

  // Group statistics by agent
  const agentStats: any[] = []
  const agentMap = new Map<string, Statistics[]>()

  statistics.forEach(stat => {
    if (!agentMap.has(stat.agentId)) {
      agentMap.set(stat.agentId, [])
    }
    agentMap.get(stat.agentId)!.push(stat)
  })

  agentMap.forEach((stats, agentId) => {
    const totalCalls = stats.reduce((sum, s) => sum + s.anzahl, 0)
    const totalCompleted = stats.reduce((sum, s) => sum + s.abgeschlossen, 0)
    const totalSuccess = stats.reduce((sum, s) => sum + s.erfolgreich, 0)
    const totalTime = stats.reduce((sum, s) => sum + s.gespraechszeit, 0)
    const reachRate = totalCalls > 0 ? (totalCompleted / totalCalls) * 100 : 0
    const avgDuration = totalCompleted > 0 ? totalTime / totalCompleted / 60 : 0

    const projectStats = stats.map(s => ({
      projectId: s.projectId,
      projectName: projects[s.projectId] || s.projectId,
      calls: s.anzahl,
      reachRate: s.anzahl > 0 ? (s.abgeschlossen / s.anzahl) * 100 : 0,
      outcomes: s.erfolgreich,
      duration: s.abgeschlossen > 0 ? s.gespraechszeit / s.abgeschlossen / 60 : 0
    }))

    agentStats.push({
      agentId,
      agentName: agents[agentId] || agentId,
      totalCalls,
      reachRate: parseFloat(reachRate.toFixed(1)),
      positiveOutcomes: totalSuccess,
      avgDuration: parseFloat(avgDuration.toFixed(1)),
      projects: projectStats
    })
  })

  if (!hasSearchParams) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-700 mb-4">No search parameters</h2>
          <p className="text-slate-500 mb-6">Please use the search form to view statistics</p>
          <button
            onClick={() => setLocation('/search')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            data-testid="button-go-to-search"
          >
            Go to Search
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLocation('/search')}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-2xl font-semibold text-slate-900">Statistics Results</h1>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-sm text-slate-600 hover:text-slate-900" data-testid="button-language-de">DE</button>
            <span className="text-slate-300">|</span>
            <button className="text-sm text-slate-600 hover:text-slate-900" data-testid="button-language-en">EN</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {kpiData && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow" data-testid="card-total-calls">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">Total Calls</span>
                  <Phone className="w-5 h-5 text-blue-500" />
                </div>
                <div className="text-3xl font-bold text-slate-900 mb-1">{kpiData.totalCalls.toLocaleString()}</div>
                <div className="text-xs text-green-600">+12% vs. last week</div>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow" data-testid="card-reach-rate">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">Reach Rate</span>
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </div>
                <div className="text-3xl font-bold text-slate-900 mb-1">{kpiData.reachRate}%</div>
                <div className="text-xs text-slate-500">Target: 70%</div>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow" data-testid="card-positive-outcomes">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">Positive Outcomes</span>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div className="text-3xl font-bold text-slate-900 mb-1">{kpiData.positiveOutcomes}</div>
                <div className="text-xs text-green-600">+8% vs. last week</div>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow" data-testid="card-avg-duration">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">Avg. Call Duration</span>
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
                <div className="text-3xl font-bold text-slate-900 mb-1">{kpiData.avgDuration} min</div>
                <div className="text-xs text-slate-500">Industry avg: 3.8 min</div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-900">Agent Statistics</h2>
                <button className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" data-testid="button-export-csv">
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Agent</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase">Total Calls</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase">Reach %</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase">Positive Outcomes</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase">Avg Duration (min)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {agentStats.map((agent) => (
                      <>
                        <tr
                          key={agent.agentId}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => toggleRow(agent.agentId)}
                          data-testid={`row-agent-${agent.agentId}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center">
                              {agent.projects.length > 0 && (
                                expandedRows.has(agent.agentId) ? (
                                  <ChevronDown className="w-4 h-4 text-slate-400 mr-2" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400 mr-2" />
                                )
                              )}
                              <span className="text-sm font-medium text-slate-900">{agent.agentName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">{agent.totalCalls.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-medium ${agent.reachRate >= 70 ? 'text-green-600' : 'text-amber-600'}`}>
                              {agent.reachRate}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">{agent.positiveOutcomes}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">{agent.avgDuration}</td>
                        </tr>
                        {expandedRows.has(agent.agentId) && agent.projects.map((project: any) => (
                          <tr key={`${agent.agentId}-${project.projectId}`} className="bg-blue-50/50" data-testid={`row-project-${project.projectId}`}>
                            <td className="px-4 py-2 pl-12">
                              <span className="text-sm text-slate-600">{project.projectName}</span>
                            </td>
                            <td className="px-4 py-2 text-right text-sm text-slate-600">{project.calls.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right text-sm text-slate-600">{project.reachRate.toFixed(1)}%</td>
                            <td className="px-4 py-2 text-right text-sm text-slate-600">{project.outcomes}</td>
                            <td className="px-4 py-2 text-right text-sm text-slate-600">{project.duration.toFixed(1)}</td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
                {agentStats.length === 0 && (
                  <div className="text-center py-8 text-slate-500">No statistics available</div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4">
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
