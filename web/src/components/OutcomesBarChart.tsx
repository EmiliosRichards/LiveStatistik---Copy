'use client'

import { BarChart3 } from 'lucide-react'

export function OutcomesBarChart() {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Call Outcomes Distribution
          </h3>
          <p className="text-xs text-slate-500">Charts temporarily paused</p>
        </div>
      </div>
      <div className="h-48 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center">
        <div className="text-xs text-slate-500">Placeholder</div>
      </div>
    </div>
  )
}
