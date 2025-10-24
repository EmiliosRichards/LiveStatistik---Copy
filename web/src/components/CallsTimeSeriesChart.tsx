'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp } from 'lucide-react'

interface TimeSeriesData {
  month: string
  calls: number
}

export function CallsTimeSeriesChart() {
  const [data, setData] = useState<TimeSeriesData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const currentYear = new Date().getFullYear()
        const response = await fetch(`/api/monthly-call-trends?year=${currentYear}`)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`)
        }
        
        const result: TimeSeriesData[] = await response.json()
        
        // Only show months up to current month
        const currentMonth = new Date().getMonth() + 1 // 1-12
        const filteredData = result.filter((_, index) => index + 1 <= currentMonth)
        
        setData(filteredData)
      } catch (error) {
        console.error('Failed to fetch time series data:', error)
        // Show empty state on error
        setData([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="h-64 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <div className="h-4 w-32 bg-slate-200 rounded"></div>
          <div className="h-3 w-24 bg-slate-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Calls This Year
          </h3>
          <p className="text-xs text-slate-500">Monthly call volume trends</p>
        </div>
      </div>
      <div className="bg-slate-50 rounded-md p-2">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 12, fill: '#94a3b8' }} 
              stroke="#cbd5e1"
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#94a3b8' }} 
              stroke="#cbd5e1"
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#ffffff', 
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '12px'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="calls" 
              stroke="#93c5fd" 
              strokeWidth={3}
              dot={{ fill: '#60a5fa', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#3b82f6' }}
              name="Total Calls"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
