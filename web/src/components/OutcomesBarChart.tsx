'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { BarChart3 } from 'lucide-react'

interface OutcomeData {
  name: string
  count: number
  percentage: number
}

const COLORS = [
  '#86efac', // Success - light green
  '#fcd34d', // Callback - light amber
  '#a5b4fc', // No Answer - light indigo
  '#f9a8d4', // Declined - light pink
  '#cbd5e1', // Other - light slate
]

export function OutcomesBarChart() {
  const [data, setData] = useState<OutcomeData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        // Fetch data for the current year
        const currentYear = new Date().getFullYear()
        const dateFrom = `${currentYear}-01-01`
        const dateTo = new Date().toISOString().split('T')[0]
        
        const response = await fetch(`/api/outcome-distribution?dateFrom=${dateFrom}&dateTo=${dateTo}`)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`)
        }
        
        const result: OutcomeData[] = await response.json()
        setData(result)
      } catch (error) {
        console.error('Failed to fetch outcomes data:', error)
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
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Call Outcomes Distribution
          </h3>
          <p className="text-xs text-slate-500">Breakdown by outcome type</p>
        </div>
      </div>
      <div className="bg-slate-50 rounded-md p-2">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 11, fill: '#94a3b8' }} 
              stroke="#cbd5e1"
              angle={-15}
              textAnchor="end"
              height={60}
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
              formatter={(value: number, name: string, props: any) => [
                `${value} calls (${props.payload.percentage}%)`,
                name
              ]}
            />
            <Bar dataKey="count" name="Calls" radius={[6, 6, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
