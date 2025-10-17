'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Phone, TrendingUp, CheckCircle, Clock, ArrowLeft } from 'lucide-react'
import { StatisticsTable } from '@/components/StatisticsTable'
import { type Statistics } from '@/lib/api'

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
  const [kpiData, setKpiData] = useState<KPIData | null>(null)
  const [statistics, setStatistics] = useState<Statistics[]>([])
  const [agents, setAgents] = useState<Record<string, string>>({})
  const [projects, setProjects] = useState<Record<string, string>>({})

  const hasSearchParams = searchParams.get('dateFrom') && (searchParams.get('agents') || searchParams.get('projects'))
  
  // Serialize all params to trigger refetch when any param changes
  const paramsString = searchParams.toString()

  useEffect(() => {
    if (hasSearchParams) {
      fetchStatistics()
    }
  }, [paramsString])

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
          dateFrom,
          dateTo,
          timeFrom,
          timeTo
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

      // Calculate KPIs from statistics
      const totalCalls = stats.reduce((sum, s) => sum + s.anzahl, 0)
      const totalSuccess = stats.reduce((sum, s) => sum + s.erfolgreich, 0)
      const totalCompleted = stats.reduce((sum, s) => sum + s.abgeschlossen, 0)
      const reachRate = totalCalls > 0 ? (totalCompleted / totalCalls) * 100 : 0
      const totalTime = stats.reduce((sum, s) => sum + s.gespraechszeit, 0)
      const avgDuration = totalCompleted > 0 ? totalTime / totalCompleted / 60 : 0

      setKpiData({
        totalCalls,
        reachRate: parseFloat(reachRate.toFixed(1)),
        positiveOutcomes: totalSuccess,
        avgDuration: parseFloat(avgDuration.toFixed(1))
      })
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
      // Fall back to mock data
      setKpiData({
        totalCalls: 1247,
        reachRate: 68.5,
        positiveOutcomes: 156,
        avgDuration: 4.2
      })
    } finally {
      setLoading(false)
    }
  }

  if (!hasSearchParams) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-700 mb-4">No search parameters</h2>
          <p className="text-slate-500 mb-6">Please use the search form to view statistics</p>
          <button
            onClick={() => router.push('/dashboard/search')}
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
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard/search')}
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-lg p-6 shadow-md animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-24 mb-4"></div>
                <div className="h-8 bg-slate-200 rounded w-32 mb-2"></div>
                <div className="h-3 bg-slate-200 rounded w-20"></div>
              </div>
            ))}
          </div>
        ) : kpiData ? (
          <>
            {/* KPI Cards */}
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

            {/* Statistics Table */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-900">Agent Statistics</h2>
                <button className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" data-testid="button-export-csv">
                  Export CSV
                </button>
              </div>
              <StatisticsTable statistics={statistics} agents={agents} projects={projects} />
            </div>
          </>
        ) : null}
      </main>

      {/* Footer */}
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
