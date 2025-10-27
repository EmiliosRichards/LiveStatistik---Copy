import { useState, Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { type Statistics } from '@/lib/api'
import { tableBase, theadBase, tbodyBase, thBase, tdBase, trBase, containerBase } from '@/components/table-styles'

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
  view?: 'overview' | 'details'
}

export function StatisticsTable({ statistics, agents, projects, view = 'overview' }: StatisticsTableProps) {
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

    // Aggregate by project to avoid duplicate rows/keys (and compute extended metrics)
    const projectAggregates = new Map<string, { calls: number; completed: number; success: number; wz: number; gz: number; nbz: number; vbz: number; az: number }>()
    stats.forEach(s => {
      const agg = projectAggregates.get(s.projectId) || { calls: 0, completed: 0, success: 0, wz: 0, gz: 0, nbz: 0, vbz: 0, az: 0 }
      agg.calls += s.anzahl
      agg.completed += s.abgeschlossen
      agg.success += s.erfolgreich
      agg.wz += (s as any).wartezeit || 0
      agg.gz += s.gespraechszeit || 0
      agg.nbz += (s as any).nachbearbeitungszeit || 0
      agg.vbz += (s as any).vorbereitungszeit || 0
      agg.az += (s as any).arbeitszeit || 0
      projectAggregates.set(s.projectId, agg)
    })

    const projectStats: ProjectStats[] = Array.from(projectAggregates.entries()).map(([projectId, agg]) => ({
      projectId,
      projectName: projects[projectId] || projectId,
      calls: agg.calls,
      reachRate: agg.calls > 0 ? (agg.completed / agg.calls) * 100 : 0,
      outcomes: agg.success,
      duration: agg.completed > 0 ? (agg.gz || 0) / Math.max(agg.completed, 1) / 60 : 0
    }))

    // Agent metrics (old design parity)
    const dateValues = stats
      .map(s => new Date(s.date as any))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    const dateFrom = dateValues[0]
    const dateTo = dateValues[dateValues.length - 1]
    const wz = stats.reduce((sum, s) => sum + (s.wartezeit || 0), 0)
    const gz = stats.reduce((sum, s) => sum + (s.gespraechszeit || 0), 0)
    const nbz = stats.reduce((sum, s) => sum + (s.nachbearbeitungszeit || 0), 0)
    const vbz = stats.reduce((sum, s) => sum + (s.vorbereitungszeit || 0), 0)
    const az = stats.reduce((sum, s) => sum + (s.arbeitszeit || 0), 0)
    const erfolgProStunde = az > 0 ? totalSuccess / az : 0

    agentStats.push({
      agentId,
      agentName: agents[agentId] || agentId,
      totalCalls,
      reachRate: parseFloat(reachRate.toFixed(1)),
      positiveOutcomes: totalSuccess,
      avgDuration: parseFloat(avgDuration.toFixed(1)),
      projects: projectStats
    })

    // Attach as a non-exported property for render (avoid changing type)
    const metrics = {
      dateFrom: dateFrom ? dateFrom.toISOString().slice(0,10) : undefined,
      dateTo: dateTo ? dateTo.toISOString().slice(0,10) : undefined,
      totalCalls,
      totalCompleted,
      totalSuccess,
      wz, gz, nbz, vbz, az, erfolgProStunde
    }
    ;(agentStats[agentStats.length - 1] as any)._metrics = metrics
    ;(agentStats[agentStats.length - 1] as any)._projectMetrics = Array.from(projectAggregates.entries()).map(([projectId, agg]) => ({
      projectId,
      projectName: projects[projectId] || projectId,
      totalCalls: agg.calls,
      totalCompleted: agg.completed,
      totalSuccess: agg.success,
      wz: agg.wz,
      gz: agg.gz,
      nbz: agg.nbz,
      vbz: agg.vbz,
      az: agg.az,
      erfolgProStunde: (agg.az || 0) > 0 ? agg.success / agg.az : 0
    }))
  })

  const handleAgentClick = (agentId: string) => {
    // Navigate to dedicated agent detail route, preserving filters
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    const dateFrom = params.get('dateFrom') || ''
    const dateTo = params.get('dateTo') || ''
    const timeFrom = params.get('timeFrom') || ''
    const timeTo = params.get('timeTo') || ''
    const projects = params.get('projects') || ''
    const qs = new URLSearchParams({
      dateFrom,
      dateTo,
      ...(timeFrom ? { timeFrom } : {}),
      ...(timeTo ? { timeTo } : {}),
      ...(projects ? { projects } : {}),
    }).toString()
    window.location.href = `/dashboard/agent/${agentId}?${qs}`
  }

  return (
    <div className={containerBase}>
      <table className={tableBase}>
        {view === 'overview' ? (
          <colgroup>
            <col style={{ width: '40%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
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
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
        )}
        <thead className={theadBase}>
          {view === 'overview' ? (
            <tr>
              <th className={`${thBase} text-left truncate`} title="Agent">
                Agent
              </th>
              <th className={`${thBase} text-right truncate`} title="Total Calls">
                Total Calls
              </th>
              <th className={`${thBase} text-right truncate`} title="Reach %">
                Reach %
              </th>
              <th className={`${thBase} text-right truncate`} title="Positive Outcomes">
                Positive Outcomes
              </th>
              <th className={`${thBase} text-right truncate`} title="Avg Duration (min)">
                Avg Duration (min)
              </th>
            </tr>
          ) : (
            <tr>
              <th className={`${thBase} text-left truncate`} title="Agent">Agent</th>
              <th className={`${thBase} text-right truncate`} title="Anzahl">Anzahl</th>
              <th className={`${thBase} text-right truncate`} title="abgeschlossen">abgeschlossen</th>
              <th className={`${thBase} text-right truncate`} title="erfolgreich">erfolgreich</th>
              <th className={`${thBase} text-right truncate`} title="Wartezeit (WZ)">WZ (h)</th>
              <th className={`${thBase} text-right truncate`} title="Gesprächszeit (GZ)">GZ (h)</th>
              <th className={`${thBase} text-right truncate`} title="Nachbearbeitungszeit (NBZ)">NBZ (h)</th>
              <th className={`${thBase} text-right truncate`} title="Vorbereitungszeit (VBZ)">VBZ (h)</th>
              <th className={`${thBase} text-right truncate`} title="Erfolg pro Stunde">Erfolg/h</th>
              <th className={`${thBase} text-right truncate`} title="Arbeitszeit (AZ)">AZ (h)</th>
            </tr>
          )}
        </thead>
        <tbody className={tbodyBase}>
          {agentStats.map((agent) => (
            <Fragment key={agent.agentId}>
              <tr
                className={`${trBase} transition-colors cursor-pointer bg-slate-50/60`}
                onClick={() => toggleRow(agent.agentId)}
                data-testid={`row-agent-${agent.agentId}`}
              >
                <td className={tdBase}>
                  <div className="flex items-center">
                    {agent.projects.length > 0 && (
                      expandedRows.has(agent.agentId) ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 mr-2" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 mr-2" />
                      )
                    )}
                    <button
                      className="text-sm font-medium text-blue-600 hover:underline"
                      onClick={(e) => { e.stopPropagation(); handleAgentClick(agent.agentId) }}
                    >
                      {agent.agentName}
                    </button>
                  </div>
                </td>
                {view === 'overview' ? (
                  <>
                    <td className={`${tdBase} text-right font-semibold`}>{agent.totalCalls.toLocaleString()}</td>
                    <td className={`${tdBase} text-right`}>
                      <span className={`text-sm font-medium ${
                        agent.reachRate >= 70 ? 'text-green-600' : 'text-amber-600'
                      }`}>
                        {agent.reachRate}%
                      </span>
                    </td>
                    <td className={`${tdBase} text-right font-semibold`}>{agent.positiveOutcomes}</td>
                    <td className={`${tdBase} text-right font-semibold`}>{agent.avgDuration}</td>
                  </>
                ) : (
                  (() => {
                    const m = (agent as any)._metrics
                    return (
                      <>
                        <td className={`${tdBase} text-right font-semibold`}>{(m.totalCalls || 0).toLocaleString()}</td>
                        <td className={`${tdBase} text-right font-semibold`}>{(m.totalCompleted || 0).toLocaleString()}</td>
                        <td className={`${tdBase} text-right font-semibold`}>{(m.totalSuccess || 0).toLocaleString()}</td>
                        <td className={`${tdBase} text-right font-semibold`}>{(m.wz || 0).toFixed(2)}</td>
                        <td className={`${tdBase} text-right font-semibold`}>{(m.gz || 0).toFixed(2)}</td>
                        <td className={`${tdBase} text-right font-semibold`}>{(m.nbz || 0).toFixed(2)}</td>
                        <td className={`${tdBase} text-right font-semibold`}>{(m.vbz || 0).toFixed(2)}</td>
                        <td className={`${tdBase} text-right font-semibold`}>{(m.erfolgProStunde || 0).toFixed(2)}</td>
                        <td className={`${tdBase} text-right font-semibold`}>{(m.az || 0).toFixed(2)}</td>
                      </>
                    )
                  })()
                )}
              </tr>
              {/* Metrics card grid removed */}
              {/* Metrics table (agent summary + per-project rows) */}
              {expandedRows.has(agent.agentId) && view === 'overview' && (
                <>
                  {((agent as any)._projectMetrics as any[]).map((pm: any) => (
                    <tr key={`${agent.agentId}-ov-${pm.projectId}`} className={`${trBase} bg-white`}>
                      <td className={`${tdBase} pl-10 text-blue-700 cursor-pointer`} onClick={() => handleAgentClick(agent.agentId)}>{pm.projectName}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.totalCalls.toLocaleString()}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.totalCalls ? (pm.totalCompleted / pm.totalCalls * 100).toFixed(1) : '0.0'}%</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.totalSuccess.toLocaleString()}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.totalCompleted ? ((pm.gz / pm.totalCompleted) / 60).toFixed(2) : '0.00'}</td>
                    </tr>
                  ))}
                </>
              )}
              {expandedRows.has(agent.agentId) && view === 'details' && (
                <>
                  {((agent as any)._projectMetrics as any[]).map((pm: any) => (
                    <tr key={`${agent.agentId}-detail-${pm.projectId}`} className={`${trBase} bg-white`}>
                      <td className={`${tdBase} pl-10 text-blue-700 cursor-pointer`} onClick={() => handleAgentClick(agent.agentId)}>{pm.projectName}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.totalCalls.toLocaleString()}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.totalCompleted.toLocaleString()}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.totalSuccess.toLocaleString()}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.wz.toFixed(2)}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.gz.toFixed(2)}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.nbz.toFixed(2)}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.vbz.toFixed(2)}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.erfolgProStunde.toFixed(2)}</td>
                      <td className={`${tdBase} text-right text-slate-800`}>{pm.az.toFixed(2)}</td>
                    </tr>
                  ))}
                </>
              )}
              {expandedRows.has(agent.agentId) && (
                <tr className="bg-transparent">
                  <td colSpan={view === 'overview' ? 5 : 10} className="py-3"></td>
                </tr>
              )}
              {/* Old simple project rows removed in favor of metrics table */}
            </Fragment>
          ))}
        </tbody>
      </table>
      {agentStats.length === 0 && (
        <div className="text-center py-8 text-slate-500">No statistics available</div>
      )}
    </div>
  )
}
