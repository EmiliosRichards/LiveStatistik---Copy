import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { type Statistics } from '@/lib/api'

interface AgentStats {
  agentId: string
  agentName: string
  totalCalls: number
  reachRate: number
  positiveOutcomes: number
  avgDuration: number
  projects: ProjectStats[]
}

interface ProjectStats {
  projectId: string
  projectName: string
  calls: number
  reachRate: number
  outcomes: number
  duration: number
}

interface StatisticsTableProps {
  statistics: Statistics[]
  agents: Record<string, string>
  projects: Record<string, string>
}

export function StatisticsTable({ statistics, agents, projects }: StatisticsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

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
  const agentStats: AgentStats[] = []
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

    const projectStats: ProjectStats[] = stats.map(s => ({
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
              Agent
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
              Total Calls
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
              Reach %
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
              Positive Outcomes
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
              Avg Duration (min)
            </th>
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
                  <span className={`text-sm font-medium ${
                    agent.reachRate >= 70 ? 'text-green-600' : 'text-amber-600'
                  }`}>
                    {agent.reachRate}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm text-slate-700">{agent.positiveOutcomes}</td>
                <td className="px-4 py-3 text-right text-sm text-slate-700">{agent.avgDuration}</td>
              </tr>
              {expandedRows.has(agent.agentId) && agent.projects.map((project) => (
                <tr
                  key={`${agent.agentId}-${project.projectId}`}
                  className="bg-blue-50/50"
                  data-testid={`row-project-${project.projectId}`}
                >
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
  )
}
