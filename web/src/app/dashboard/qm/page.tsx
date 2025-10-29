'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Calendar } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import { tableBase, theadBase, tbodyBase, thBase, tdBase, trBase } from '@/components/table-styles'
import type { QmRow } from '../../../../../shared/schema'

export default function QMPage() {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [qmData, setQmData] = useState<QmRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [agentFilter, setAgentFilter] = useState('')
  const [campaignFilter, setCampaignFilter] = useState('')

  const currentMonth = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  useEffect(() => {
    setSelectedMonth(currentMonth)
  }, [currentMonth])

  useEffect(() => {
    if (!selectedMonth) return
    loadQMData()
  }, [selectedMonth])

  const loadQMData = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (selectedMonth) params.set('month', selectedMonth)
      
      const response = await fetch(`/api/qm?${params.toString()}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Failed to load QM data: ${response.statusText}`)
      }
      const data = await response.json()
      setQmData(data)
    } catch (err) {
      console.error('QM Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load QM data')
    } finally {
      setLoading(false)
    }
  }

  const filteredData = useMemo(() => {
    return qmData.filter(row => {
      const matchesAgent = !agentFilter || row.agentName.toLowerCase().includes(agentFilter.toLowerCase())
      const matchesCampaign = !campaignFilter || row.projectName.toLowerCase().includes(campaignFilter.toLowerCase())
      return matchesAgent && matchesCampaign
    })
  }, [qmData, agentFilter, campaignFilter])

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedRows(newExpanded)
  }

  const monthOptions = useMemo(() => {
    const options = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const label = date.toLocaleDateString('de-DE', { year: 'numeric', month: 'long' })
      options.push({ value, label })
    }
    return options
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 pb-20">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {t('qm.title')}
          </h1>
          <p className="text-slate-600">
            {t('qm.subtitle')}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                {t('qm.month')}
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="select-month"
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('qm.filterAgent')}
              </label>
              <input
                type="text"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                placeholder={t('qm.filterAgentPlaceholder')}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="input-filter-agent"
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('qm.filterCampaign')}
              </label>
              <input
                type="text"
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                placeholder={t('qm.filterCampaignPlaceholder')}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="input-filter-campaign"
              />
            </div>

            <button
              onClick={loadQMData}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              data-testid="button-refresh"
            >
              {t('qm.refresh')}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-800">
            <strong>{t('qm.error')}:</strong> {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-slate-600">{t('qm.loading')}</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center text-slate-600">
            {t('qm.noData')}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className={tableBase}>
                <thead className={theadBase}>
                  <tr className={trBase}>
                    <th className={thBase} style={{ width: '40px' }}></th>
                    <th className={thBase}>{t('qm.agent')}</th>
                    <th className={thBase}>{t('qm.campaign')}</th>
                    <th className={`${thBase} text-right`}>{t('qm.target')}</th>
                    <th className={`${thBase} text-right`}>{t('qm.achieved')}</th>
                    <th className={`${thBase} text-right`}>{t('qm.perf')}</th>
                    <th className={`${thBase} text-right`}>{t('qm.attainment')}</th>
                    <th className={thBase}>{t('qm.notes')}</th>
                  </tr>
                </thead>
                <tbody className={tbodyBase}>
                  {filteredData.map((row, index) => {
                    const isExpanded = expandedRows.has(index)
                    const attainmentPct = row.targetSoll && row.targetSoll > 0
                      ? ((row.achievedSum / row.targetSoll) * 100).toFixed(1)
                      : '—'
                    
                    return (
                      <Fragment key={index}>
                        <tr className={trBase} data-testid={`row-qm-${index}`}>
                          <td className={tdBase}>
                            <button
                              onClick={() => toggleRow(index)}
                              className="p-1 hover:bg-slate-100 rounded"
                              data-testid={`button-expand-${index}`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-slate-600" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-600" />
                              )}
                            </button>
                          </td>
                          <td className={tdBase}>{row.agentName}</td>
                          <td className={tdBase}>{row.projectName}</td>
                          <td className={`${tdBase} text-right font-medium`}>
                            {row.targetSoll ?? '—'}
                          </td>
                          <td className={`${tdBase} text-right font-semibold text-blue-600`}>
                            {row.achievedSum}
                          </td>
                          <td className={`${tdBase} text-right`}>
                            {row.perfScore !== null ? row.perfScore.toFixed(2) : '—'}
                          </td>
                          <td className={`${tdBase} text-right font-semibold ${
                            parseFloat(attainmentPct) >= 100 ? 'text-green-600' :
                            parseFloat(attainmentPct) >= 80 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {attainmentPct !== '—' ? `${attainmentPct}%` : '—'}
                          </td>
                          <td className={`${tdBase} text-slate-600 text-sm max-w-xs truncate`}>
                            {row.notes || '—'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="px-6 py-4 bg-slate-50">
                              <div className="text-sm">
                                <div className="font-semibold text-slate-700 mb-2">
                                  {t('qm.dailyBreakdown')}:
                                </div>
                                <div className="grid grid-cols-7 gap-2">
                                  {row.daily.filter((d: any) => d.value !== undefined || d.code).map((day: any) => (
                                    <div
                                      key={day.day}
                                      className="flex flex-col items-center p-2 border border-slate-200 rounded bg-white"
                                      data-testid={`day-cell-${index}-${day.day}`}
                                    >
                                      <div className="text-xs text-slate-500 font-medium">
                                        {t('qm.day')} {day.day}
                                      </div>
                                      <div className="text-sm font-semibold">
                                        {day.value !== undefined ? (
                                          <span className="text-blue-600">{day.value}</span>
                                        ) : day.code ? (
                                          <span className="text-amber-600 font-mono">{day.code}</span>
                                        ) : (
                                          <span className="text-slate-300">—</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Import Fragment
import { Fragment } from 'react'
