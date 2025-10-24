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
        // Mock data for now - you can replace with actual API call
        // const response = await fetch('/api/monthly-calls')
        // const result = await response.json()
        
        const mockData: TimeSeriesData[] = [
          { month: 'Jan', calls: 9850 },
          { month: 'Feb', calls: 10200 },
          { month: 'Mar', calls: 11500 },
          { month: 'Apr', calls: 10800 },
          { month: 'May', calls: 12100 },
          { month: 'Jun', calls: 11900 },
          { month: 'Jul', calls: 12500 },
          { month: 'Aug', calls: 11800 },
          { month: 'Sep', calls: 12300 },
          { month: 'Oct', calls: 12569 },
          { month: 'Nov', calls: 11200 },
          { month: 'Dec', calls: 10500 },
        ]
        
        setData(mockData)
      } catch (error) {
        console.error('Failed to fetch time series data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Calls This Year
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Monthly call volume trends</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="chartBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" stopOpacity={0.8}/>
              <stop offset="100%" stopColor="#f8fafc" stopOpacity={0.3}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
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
  )
}
