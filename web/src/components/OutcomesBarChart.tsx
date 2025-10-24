'use client'

import { BarChart3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function OutcomesBarChart() {
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const { data: chartData, isLoading, error } = useQuery<{ name: string; count: number; percentage: number }[]>({
    queryKey: ['/api/outcome-distribution', startOfYear, today],
    queryFn: async () => {
      const res = await fetch(`/api/outcome-distribution?dateFrom=${startOfYear}&dateTo=${today}`)
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
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Call Outcomes Distribution
          </h3>
          <p className="text-xs text-slate-500">Breakdown by outcome type</p>
        </div>
      </div>
      
      {isLoading ? (
        <div className="h-48 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center">
          <div className="text-xs text-slate-500">Loading chart data...</div>
        </div>
      ) : error ? (
        <div className="h-48 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center">
          <div className="text-xs text-red-500">Failed to load chart data</div>
        </div>
      ) : !chartData || chartData.length === 0 ? (
        <div className="h-48 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center">
          <div className="text-xs text-slate-500">No data available</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#cbd5e1"
              angle={-45}
              textAnchor="end"
              height={80}
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
              formatter={(value: number, name: string, props: any) => [
                `${value} calls (${props.payload.percentage}%)`,
                'Count'
              ]}
            />
            <Bar 
              dataKey="count" 
              fill="#0369a1"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
