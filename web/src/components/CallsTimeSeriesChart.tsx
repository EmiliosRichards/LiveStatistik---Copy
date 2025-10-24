'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp } from 'lucide-react'

interface TimeSeriesData {
  date: string
  calls: number
  reached: number
  positive: number
}

export function CallsTimeSeriesChart() {
  const [data, setData] = useState<TimeSeriesData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        // Mock data for now - you can replace with actual API call
        // const response = await fetch('/api/time-series')
        // const result = await response.json()
        
        const mockData: TimeSeriesData[] = [
          { date: 'Mon', calls: 2450, reached: 2180, positive: 52 },
          { date: 'Tue', calls: 2680, reached: 2390, positive: 61 },
          { date: 'Wed', calls: 2520, reached: 2250, positive: 58 },
          { date: 'Thu', calls: 2730, reached: 2440, positive: 64 },
          { date: 'Fri', calls: 2589, reached: 2308, positive: 61 },
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
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Calls This Week
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Daily call volume and outcomes</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12, fill: '#64748b' }} 
            stroke="#cbd5e1"
          />
          <YAxis 
            tick={{ fontSize: 12, fill: '#64748b' }} 
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
          <Legend 
            wrapperStyle={{ fontSize: '12px' }}
            iconType="line"
          />
          <Line 
            type="monotone" 
            dataKey="calls" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 3 }}
            name="Total Calls"
          />
          <Line 
            type="monotone" 
            dataKey="reached" 
            stroke="#10b981" 
            strokeWidth={2}
            dot={{ fill: '#10b981', r: 3 }}
            name="Reached"
          />
          <Line 
            type="monotone" 
            dataKey="positive" 
            stroke="#f59e0b" 
            strokeWidth={2}
            dot={{ fill: '#f59e0b', r: 3 }}
            name="Positive"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
