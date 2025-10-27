'use client'

import { TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useLanguage } from '@/contexts/LanguageContext'

export function CallsTimeSeriesChart() {
  const { t } = useLanguage()
  const { data: chartData, isLoading, error } = useQuery<{ month: string; calls: number }[]>({
    queryKey: ['/api/monthly-call-trends', new Date().getFullYear()],
    queryFn: async () => {
      const res = await fetch(`/api/monthly-call-trends?year=${new Date().getFullYear()}`)
      if (!res.ok) throw new Error('Failed to fetch chart data')
      return res.json()
    },
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            {t('dashboard.callsThisYear')}
          </h3>
          <p className="text-xs text-slate-500">{t('dashboard.monthlyTrends')}</p>
        </div>
      </div>
      
      {isLoading ? (
        <div className="h-48 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center">
          <div className="text-xs text-slate-500">{t('dashboard.loadingChart')}</div>
        </div>
      ) : error ? (
        <div className="h-48 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center">
          <div className="text-xs text-red-500">{t('dashboard.loadingChart')}</div>
        </div>
      ) : !chartData || chartData.length === 0 ? (
        <div className="h-48 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center">
          <div className="text-xs text-slate-500">{t('dashboard.noData')}</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="month" 
              tick={{ fill: '#64748b', fontSize: 12 }}
              stroke="#cbd5e1"
            />
            <YAxis 
              tick={{ fill: '#64748b', fontSize: 12 }}
              stroke="#cbd5e1"
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="calls" 
              stroke="#0369a1" 
              strokeWidth={2}
              dot={{ fill: '#0369a1', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
