'use client'

import { useEffect, useState, useMemo } from 'react'
import { Sparkles, CheckCircle2, Archive } from 'lucide-react'

type SheetRow = {
  campaign: string
  campaign_id: string
  status?: 'new'|'active'|'archived'|string
  company?: string
  time_category?: string
  target?: string
  dialfire_phone?: string
  dbsync_id?: string
}

export default function CampaignsAdminPage() {
  const [rows, setRows] = useState<SheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['new', 'active', 'archived'])
  const [q, setQ] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/campaign-mapping', { credentials: 'include' })
        const data = await res.json()
        const list = Array.isArray(data.rows) ? data.rows : []
        setRows(list)
      } catch (e: any) {
        setError(e?.message || 'Failed to load campaigns from sheet')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Calculate counts for each status
  const counts = useMemo(() => {
    return {
      all: rows.length,
      new: rows.filter(r => r.status === 'new').length,
      active: rows.filter(r => r.status === 'active').length,
      archived: rows.filter(r => r.status === 'archived').length
    }
  }, [rows])

  // Toggle status selection
  const toggleStatus = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter(s => s !== status))
    } else {
      setSelectedStatuses([...selectedStatuses, status])
    }
  }

  // Toggle all statuses
  const toggleAll = () => {
    if (selectedStatuses.length === 3) {
      setSelectedStatuses([])
    } else {
      setSelectedStatuses(['new', 'active', 'archived'])
    }
  }

  const filtered = rows
    .filter(r => selectedStatuses.length === 0 ? false : selectedStatuses.includes(r.status || ''))
    .filter(r => q.trim()==='' ? true : (r.campaign?.toLowerCase().includes(q.toLowerCase()) || r.campaign_id?.toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-slate-100">
      <main className="flex-1 w-full px-6 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 className="text-lg font-semibold text-slate-900">Campaigns Admin</h1>
            <div className="flex items-center gap-2">
              <input 
                value={q} 
                onChange={e=>setQ(e.target.value)} 
                placeholder="Search name or ID" 
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                data-testid="input-search-campaigns"
              />
            </div>
          </div>
          
          {/* Status Filter Chips */}
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={toggleAll}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedStatuses.length === 3
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                data-testid="button-filter-all"
              >
                All <span className="ml-1 opacity-70">({counts.all})</span>
              </button>
              <button
                onClick={() => toggleStatus('new')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedStatuses.includes('new')
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                }`}
                data-testid="button-filter-new"
              >
                <Sparkles className="w-3 h-3" />
                New <span className="ml-1 opacity-70">({counts.new})</span>
              </button>
              <button
                onClick={() => toggleStatus('active')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedStatuses.includes('active')
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
                data-testid="button-filter-active"
              >
                <CheckCircle2 className="w-3 h-3" />
                Active <span className="ml-1 opacity-70">({counts.active})</span>
              </button>
              <button
                onClick={() => toggleStatus('archived')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedStatuses.includes('archived')
                    ? 'bg-slate-600 text-white shadow-md'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
                data-testid="button-filter-archived"
              >
                <Archive className="w-3 h-3" />
                Archived <span className="ml-1 opacity-70">({counts.archived})</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-slate-600">Loading…</div>
          ) : error ? (
            <div className="text-red-600">{error}</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="text-left py-2 px-3">Campaign</th>
                    <th className="text-left py-2 px-3">ID</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Company</th>
                    <th className="text-left py-2 px-3">Time category</th>
                    <th className="text-left py-2 px-3">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={`${r.campaign_id}-${r.campaign}`}>
                      <td className="py-2 px-3">{r.campaign}</td>
                      <td className="py-2 px-3 font-mono text-xs">{r.campaign_id}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${r.status==='active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : r.status==='new' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{r.status}</span>
                      </td>
                      <td className="py-2 px-3">{r.company || ''}</td>
                      <td className="py-2 px-3">{r.time_category || ''}</td>
                      <td className="py-2 px-3">{r.dialfire_phone || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}


