'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { HelpCircle, Bell, User, ChevronDown, ArrowLeft, ArrowRight, Volume2, FileText, StickyNote, Download, Filter, Clock } from 'lucide-react'

// Normalize notes text: convert literal "\\n" (and "\\r\\n") sequences into real line breaks
function normalizeNotes(text: string): string {
  return text.replace(/\\r\\n|\\n|\\r/g, '\n')
}

export default function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [showHeader, setShowHeader] = useState(true)
  
  // Agent selection state
  const [availableAgents, setAvailableAgents] = useState<Array<{ id: string; name: string }>>([])
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  
  // Call data state
  const [calls, setCalls] = useState<any[]>([])
  const [stats, setStats] = useState<any | null>(null)
  const [campaignStatus, setCampaignStatus] = useState<string>('')
  const [serverTotal, setServerTotal] = useState<number | null>(null)
  const [serverGrouped, setServerGrouped] = useState<null | { negativ: Record<string, number>; positiv: Record<string, number>; offen: Record<string, number> }>(null)
  const [statsView, setStatsView] = useState<'overview'|'details'>('overview')
  const [selectedCategory, setSelectedCategory] = useState<null | 'positiv' | 'negativ' | 'offen'>(null)
  const [selectedSub, setSelectedSub] = useState<string | null>(null)
  const [filterCalls, setFilterCalls] = useState<'alle' | 'mit_audio' | 'mit_transkript' | 'mit_notizen'>('alle')
  const [filterTime, setFilterTime] = useState<'alle' | 'heute' | 'woche' | 'monat'>('alle')
  const [filterDuration, setFilterDuration] = useState<'alle' | '0-30s' | '30-60s' | '1-5min' | '5-10min' | '10+min'>('alle')
  const [page, setPage] = useState(1)
  const pageSize = 100

  // Get filter params from URL
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const timeFrom = searchParams.get('timeFrom') || undefined
  const timeTo = searchParams.get('timeTo') || undefined

  // Build display strings for filters
  const dateRangeText = (dateFrom && dateTo)
    ? `${dateFrom} → ${dateTo}`
    : (dateFrom ? dateFrom : (dateTo ? dateTo : 'All dates'))
  const timeRangeText = (timeFrom || timeTo)
    ? `${timeFrom || '00:00'}–${timeTo || '23:59'}`
    : 'All times'

  // Header scroll behavior
  useEffect(() => {
    let lastY = 0
    const onScroll = () => {
      const y = window.scrollY || 0
      if (y <= 0) { setShowHeader(true); lastY = 0; return }
      if (y - lastY > 5) setShowHeader(false)
      else if (lastY - y > 5) setShowHeader(true)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Load campaign metadata and available agents
  useEffect(() => {
    let cancelled = false
    const loadMetadata = async () => {
      try {
        const [agentsRes, projectsRes] = await Promise.all([
          fetch('/api/agents', { credentials: 'include' }),
          fetch('/api/projects', { credentials: 'include' })
        ])
        if (cancelled) return
        
        if (agentsRes.ok && projectsRes.ok) {
          const allAgents = await agentsRes.json()
          const projects = await projectsRes.json()
          
          const project = projects.find((p: any) => p.id === campaignId)
          setCampaignName(project?.name || campaignId)
          setCampaignStatus(project?.status || '')
          
          // Query statistics for all agents on this campaign to find who has worked on it
          // This is more reliable than trying to query a many-to-many relationship
          const statsRes = await fetch(`/api/statistics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
              agentIds: allAgents.map((a: any) => a.id),
              projectIds: [campaignId]
            })
          })
          
          if (statsRes.ok && !cancelled) {
            const statsData = await statsRes.json()
            // Extract unique agent IDs from statistics
            const agentIdsWithData = [...new Set(statsData.map((s: any) => s.agentId))]
            
            // Filter to agents that have statistics for this campaign
            const campaignAgents = allAgents.filter((agent: any) => 
              agentIdsWithData.includes(agent.id)
            )
            
            const formattedAgents = campaignAgents.map((a: any) => ({
              id: a.id,
              name: a.name.replace(/\./g, ' ')
            }))
            
            setAvailableAgents(formattedAgents)
            // Select all agents by default
            setSelectedAgentIds(formattedAgents.map((a: { id: string }) => a.id))
          }
        }
      } catch (e) {
        console.error('Failed to load metadata:', e)
      }
    }
    loadMetadata()
    return () => { cancelled = true }
  }, [campaignId])
  
  // Fetch statistics for selected agents
  useEffect(() => {
    let cancelled = false
    const loadStats = async () => {
      if (selectedAgentIds.length === 0) {
        setStats(null)
        return
      }
      
      try {
        const statsRes = await fetch(`/api/statistics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ 
            agentIds: selectedAgentIds, 
            projectIds: [campaignId], 
            dateFrom, 
            dateTo, 
            timeFrom, 
            timeTo 
          })
        })
        
        if (statsRes.ok && !cancelled) {
          const statsData = await statsRes.json()
          if (Array.isArray(statsData) && statsData.length > 0) {
            // Aggregate stats
            const agg = { calls: 0, completed: 0, success: 0, wz: 0, gz: 0, nbz: 0, vbz: 0, az: 0 }
            statsData.forEach((s: any) => {
              agg.calls += s.anzahl || 0
              agg.completed += s.abgeschlossen || 0
              agg.success += s.erfolgreich || 0
              agg.wz += s.wartezeit || 0
              agg.gz += s.gespraechszeit || 0
              agg.nbz += s.nachbearbeitungszeit || 0
              agg.vbz += s.vorbereitungszeit || 0
              agg.az += s.arbeitszeit || 0
            })
            setStats(agg)
          } else {
            setStats(null)
          }
        }
      } catch (e) {
        console.error('Failed to load statistics:', e)
      }
    }
    loadStats()
    return () => { cancelled = true }
  }, [campaignId, selectedAgentIds, dateFrom, dateTo, timeFrom, timeTo])

  // Load call details using new multi-agent endpoint
  useEffect(() => {
    let cancelled = false
    const loadCalls = async () => {
      if (selectedAgentIds.length === 0 || !campaignId) {
        setCalls([])
        setServerTotal(0)
        setServerGrouped({ negativ: {}, positiv: {}, offen: {} })
        return
      }
      
      setLoading(true)
      try {
        const res = await fetch('/api/call-details-by-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            projectId: campaignId,
            agentIds: selectedAgentIds,
            dateFrom,
            dateTo,
            timeFrom,
            timeTo
          })
        })
        
        if (cancelled) return
        
        if (res.ok) {
          const payload = await res.json()
          if (Array.isArray(payload)) {
            setCalls(payload)
            setServerTotal(payload.length)
            
            // Calculate grouped stats from calls
            const map: Record<'negativ'|'positiv'|'offen', Record<string, number>> = { negativ: {}, positiv: {}, offen: {} }
            payload.forEach((c: any) => {
              const cat: 'negativ'|'positiv'|'offen' = (String(c.outcomeCategory || 'offen').toLowerCase().includes('neg') ? 'negativ' : String(c.outcomeCategory || 'offen').toLowerCase().includes('pos') ? 'positiv' : 'offen')
              const key = c.outcome || '—'
              map[cat][key] = (map[cat][key] || 0) + 1
            })
            setServerGrouped(map)
          }
        }
      } catch (error) {
        console.error('Error loading call details:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadCalls()
    return () => { cancelled = true }
  }, [selectedAgentIds, campaignId, dateFrom, dateTo, timeFrom, timeTo])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [selectedCategory, selectedSub, filterCalls, filterTime, filterDuration])

  // Derived: grouping by category/subcategory
  const grouped = useMemo(() => {
    if (serverGrouped) return serverGrouped
    const map: Record<'negativ'|'positiv'|'offen', Record<string, number>> = { negativ: {}, positiv: {}, offen: {} }
    calls.forEach(c => {
      const cat: 'negativ'|'positiv'|'offen' = (String(c.outcomeCategory || 'offen').toLowerCase().includes('neg') ? 'negativ' : String(c.outcomeCategory || 'offen').toLowerCase().includes('pos') ? 'positiv' : 'offen')
      const key = c.outcome || '—'
      map[cat][key] = (map[cat][key] || 0) + 1
    })
    return map
  }, [calls, serverGrouped])

  const filteredCalls = useMemo(() => {
    let list = calls.slice()
    // category filter
    if (selectedCategory) {
      list = list.filter(c => {
        const cat = String(c.outcomeCategory || 'offen').toLowerCase()
        if (selectedCategory === 'negativ') return cat.includes('neg')
        if (selectedCategory === 'positiv') return cat.includes('pos')
        return !(cat.includes('neg') || cat.includes('pos'))
      })
      if (selectedSub) list = list.filter(c => (c.outcome || '—') === selectedSub)
    }
    // call filters
    if (filterCalls === 'mit_audio') list = list.filter(c => !!c.recordingUrl)
    if (filterCalls === 'mit_transkript') list = list.filter(c => !!c.transcript)
    if (filterCalls === 'mit_notizen') list = list.filter(c => !!c.notes)
    // duration filter (call duration in seconds)
    if (filterDuration !== 'alle') {
      list = list.filter(c => {
        const durationSec = c.duration || 0
        if (filterDuration === '0-30s') return durationSec >= 0 && durationSec <= 30
        if (filterDuration === '30-60s') return durationSec > 30 && durationSec <= 60
        if (filterDuration === '1-5min') return durationSec > 60 && durationSec <= 300
        if (filterDuration === '5-10min') return durationSec > 300 && durationSec <= 600
        if (filterDuration === '10+min') return durationSec > 600
        return true
      })
    }
    // time filters
    const now = new Date()
    if (filterTime !== 'alle') {
      list = list.filter(c => {
        const d = new Date(c.callStart)
        if (filterTime === 'heute') {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          return d >= today
        }
        if (filterTime === 'woche') {
          const first = new Date(now)
          const day = now.getDay() || 7
          first.setDate(now.getDate() - day + 1)
          first.setHours(0,0,0,0)
          return d >= first
        }
        if (filterTime === 'monat') {
          const first = new Date(now.getFullYear(), now.getMonth(), 1)
          return d >= first
        }
        return true
      })
    }
    return list
  }, [calls, selectedCategory, selectedSub, filterCalls, filterTime, filterDuration])

  const pageCount = filteredCalls.length
  const overallTotal = serverTotal ?? pageCount
  const totalPages = Math.max(1, Math.ceil(overallTotal / pageSize))
  const startIdx = (page - 1) * pageSize
  const endIdx = Math.min(startIdx + pageSize, overallTotal)
  const visibleCalls = filteredCalls.slice(startIdx, endIdx)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-slate-100">
      {/* Header */}
      <header className={`bg-white border-b border-border app-header sticky top-0 z-10 transition-transform duration-300 ${showHeader ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-3">
              <a href="/dashboard" className="inline-flex items-center" aria-label="Manuav Internal App">
                <img src="/Manuav-web-site-LOGO.png" alt="Manuav" className="h-8 w-auto invert" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Help" className="p-2 rounded hover:bg-slate-100"><HelpCircle className="w-5 h-5 text-slate-700" /></button>
            <button aria-label="Notifications" className="relative p-2 rounded hover:bg-slate-100"><Bell className="w-5 h-5 text-slate-700" /><span className="absolute -top-0.5 -right-0.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-red-500 text-white">1</span></button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button aria-label="Account" className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100"><div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center"><User className="w-4 h-4 text-slate-600" /></div><span className="hidden sm:inline text-sm text-slate-700">Emilios</span><ChevronDown className="w-4 h-4 text-slate-500" /></button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button className="text-sm text-slate-600 hover:text-slate-900">DE</button>
            <span className="text-slate-300">|</span>
            <button className="text-sm text-slate-600 hover:text-slate-900">EN</button>
          </div>
        </div>
      </header>

      {/* Main Content - Full Width */}
      <main className="flex-1 w-full px-6 py-8">
        <div className="bg-white rounded-lg shadow-md">
          {/* Title, Toggle, and Filter Info */}
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-semibold text-slate-900">{campaignName}</h1>
              <div className="flex items-center gap-3">
                {/* Overview/Details Toggle */}
                <div className="inline-flex items-center rounded border border-slate-300 overflow-hidden">
                  <button
                    className={`px-3 py-1.5 text-sm font-medium ${statsView === 'overview' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                    onClick={() => setStatsView('overview')}
                  >
                    Overview
                  </button>
                  <div className="w-px h-6 bg-slate-300" />
                  <button
                    className={`px-3 py-1.5 text-sm font-medium ${statsView === 'details' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                    onClick={() => setStatsView('details')}
                  >
                    Details
                  </button>
                </div>
                <button 
                  onClick={() => router.back()} 
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  ← Back
                </button>
              </div>
            </div>
            
            {/* Agent Filter Chips */}
            {availableAgents.length > 0 && (
              <div className="mb-4">
                <span className="text-sm font-medium text-slate-700 block mb-2">Agents:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      if (selectedAgentIds.length === availableAgents.length) {
                        setSelectedAgentIds([])
                      } else {
                        setSelectedAgentIds(availableAgents.map(a => a.id))
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedAgentIds.length === availableAgents.length
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    All <span className="ml-1 opacity-70">({availableAgents.length})</span>
                  </button>
                  {availableAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => {
                        if (selectedAgentIds.includes(agent.id)) {
                          setSelectedAgentIds(selectedAgentIds.filter(id => id !== agent.id))
                        } else {
                          setSelectedAgentIds([...selectedAgentIds, agent.id])
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        selectedAgentIds.includes(agent.id)
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                      }`}
                    >
                      {agent.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Filter indicators */}
            <div className="flex flex-wrap gap-3 text-sm text-slate-600 mb-4">
              {dateRangeText !== 'All dates' && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">Date Range:</span>
                  <span className="px-2 py-1 bg-slate-50 text-slate-700 rounded border border-slate-200">{dateRangeText}</span>
                </div>
              )}
              {timeRangeText !== 'All times' && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">Time Range:</span>
                  <span className="px-2 py-1 bg-slate-50 text-slate-700 rounded border border-slate-200">{timeRangeText}</span>
                </div>
              )}
            </div>

            {/* Statistics Summary - changes based on toggle */}
            {stats && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                {statsView === 'overview' ? (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <div className="text-sm text-slate-600">Total Calls</div>
                      <div className="text-lg font-semibold text-slate-900 tabular-nums">{stats.calls?.toLocaleString?.() || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">Reach %</div>
                      <div className="text-lg font-semibold text-slate-900 tabular-nums">
                        {stats.calls ? ((stats.completed / stats.calls) * 100).toFixed(1) : '0.0'}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">Positive Outcomes</div>
                      <div className="text-lg font-semibold text-emerald-600 tabular-nums">{stats.success || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">Avg Duration (min)</div>
                      <div className="text-lg font-semibold text-slate-900 tabular-nums">
                        {stats.completed ? ((stats.gz / stats.completed) / 60).toFixed(2) : '0.00'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">Status</div>
                      <div>
                        {campaignStatus && (
                          <span className={`text-xs px-2 py-1 rounded-full border ${campaignStatus==='active'?'bg-emerald-50 text-emerald-700 border-emerald-200': campaignStatus==='new'?'bg-blue-50 text-blue-700 border-blue-200':'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {campaignStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3">
                    <div>
                      <div className="text-xs text-slate-600">Anzahl</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{stats.calls?.toLocaleString?.() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">abgeschlossen</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{stats.completed || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">erfolgreich</div>
                      <div className="text-base font-semibold text-emerald-600 tabular-nums">{stats.success || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">WZ (h)</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.wz || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">GZ (h)</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.gz || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">NBZ (h)</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.nbz || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">VBZ (h)</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.vbz || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">Erfolg/h</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">
                        {stats.az ? (stats.success / stats.az).toFixed(2) : '0.00'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">AZ (h)</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.az || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">Status</div>
                      <div>
                        {campaignStatus && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${campaignStatus==='active'?'bg-emerald-50 text-emerald-700 border-emerald-200': campaignStatus==='new'?'bg-blue-50 text-blue-700 border-blue-200':'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {campaignStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Call Details Content */}
          <div className="p-6">
            {loading ? (
              <div className="p-8 text-center text-slate-600">Loading call details...</div>
            ) : calls.length === 0 ? (
              <div className="p-8 text-center text-slate-600">No calls found for this campaign and agent combination.</div>
            ) : (
              <>
                {/* Category Filter Title */}
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Call Outcome Categories</h2>
                
                {/* Category columns */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                  {(['negativ','positiv','offen'] as const).map(col => (
                    <div key={col} className={`rounded border p-4 ${col==='negativ' ? 'border-red-200 bg-red-50' : col==='positiv' ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold capitalize text-slate-900">{col}</div>
                        <div className="text-lg font-bold text-slate-900">{Object.values(grouped[col]).reduce((a,b)=>a+(b as number),0)}</div>
                      </div>
                      <div className="space-y-1">
                        {Object.entries(grouped[col]).slice(0,12).map(([name,count]) => (
                          <button 
                            key={name} 
                            className={`w-full flex items-center justify-between text-left text-sm rounded px-3 py-2 hover:bg-white/70 text-slate-800 ${selectedCategory===col && selectedSub===name ? 'bg-white shadow-sm' : ''}`} 
                            onClick={() => { setSelectedCategory(col); setSelectedSub(name) }}
                          >
                            <span className="truncate" title={name}>{name}</span>
                            <span className="font-semibold ml-2">{count as number}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Filters and controls */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-500" />
                      <select className="border border-slate-300 rounded px-3 py-1.5" value={filterDuration} onChange={e=>setFilterDuration(e.target.value as any)}>
                        <option value="alle">Alle Dauern</option>
                        <option value="0-30s">0-30 Sekunden</option>
                        <option value="30-60s">30-60 Sekunden</option>
                        <option value="1-5min">1-5 Minuten</option>
                        <option value="5-10min">5-10 Minuten</option>
                        <option value="10+min">10+ Minuten</option>
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <select className="border border-slate-300 rounded px-3 py-1.5" value={filterTime} onChange={e=>setFilterTime(e.target.value as any)}>
                        <option value="alle">Alle Zeiten</option>
                        <option value="heute">Heute</option>
                        <option value="woche">Diese Woche</option>
                        <option value="monat">Dieser Monat</option>
                      </select>
                    </div>

                    <label className="text-slate-600 font-medium">Anrufe:</label>
                    <select className="border border-slate-300 rounded px-3 py-1.5" value={filterCalls} onChange={e=>setFilterCalls(e.target.value as any)}>
                      <option value="alle">Alle Anrufe</option>
                      <option value="mit_audio">Mit Audio</option>
                      <option value="mit_transkript">Mit Transkript</option>
                      <option value="mit_notizen">Mit Notizen</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-700 font-semibold">{overallTotal.toLocaleString()} Ergebnisse</div>
                    <div className="flex items-center gap-2 text-sm text-slate-800">
                      <button
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border font-medium ${page===1 ? 'text-slate-300 border-slate-200' : 'text-slate-800 bg-white border-slate-500 hover:bg-slate-50'}`}
                        disabled={page===1}
                        onClick={()=>setPage(p=>Math.max(1,p-1))}
                        aria-label="Previous page"
                      >
                        <ArrowLeft className="w-4 h-4" /> Prev
                      </button>
                      <span className="px-2 tabular-nums font-medium">{startIdx+1}–{endIdx} / {overallTotal.toLocaleString()}</span>
                      <button
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border font-medium ${page===totalPages ? 'text-slate-300 border-slate-200' : 'text-slate-800 bg-white border-slate-500 hover:bg-slate-50'}`}
                        disabled={page===totalPages}
                        onClick={()=>setPage(p=>Math.min(totalPages,p+1))}
                        aria-label="Next page"
                      >
                        Next <ArrowRight className="w-4 h-4" />
                      </button>
                      <select className="border border-slate-400 rounded px-2 py-1 text-sm text-slate-800 ml-2" value={page} onChange={e=>setPage(parseInt(e.target.value)||1)}>
                        {Array.from({length: totalPages}, (_,i)=>i+1).slice(0,500).map(n=> (
                          <option key={n} value={n}>Page {n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Call Details Table - always visible */}
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left font-medium">ID</th>
                        <th className="py-3 px-4 text-left font-medium">Datum</th>
                        <th className="py-3 px-4 text-left font-medium">Zeit</th>
                        <th className="py-3 px-4 text-left font-medium">Dauer</th>
                        <th className="py-3 px-4 text-left font-medium">Audio Download</th>
                        <th className="py-3 px-4 text-left font-medium">Firmenname</th>
                        <th className="py-3 px-4 text-left font-medium">Ansprechpartner</th>
                        <th className="py-3 px-4 text-center font-medium">A</th>
                        <th className="py-3 px-4 text-center font-medium">T</th>
                        <th className="py-3 px-4 text-center font-medium">N</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {visibleCalls.map((c, idx) => (
                        <CallRow key={c.id || (startIdx+idx)} index={startIdx+idx+1} call={c} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Pagination */}
                <div className="flex items-center justify-end gap-3 mt-4">
                  <div className="text-sm text-slate-700 font-semibold">{overallTotal.toLocaleString()} Ergebnisse</div>
                  <div className="flex items-center gap-2 text-sm text-slate-800">
                    <button
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border font-medium ${page===1 ? 'text-slate-300 border-slate-200' : 'text-slate-800 bg-white border-slate-500 hover:bg-slate-50'}`}
                      disabled={page===1}
                      onClick={()=>setPage(p=>Math.max(1,p-1))}
                      aria-label="Previous page"
                    >
                      <ArrowLeft className="w-4 h-4" /> Prev
                    </button>
                    <span className="px-2 tabular-nums font-medium">{startIdx+1}–{endIdx} / {overallTotal.toLocaleString()}</span>
                    <button
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border font-medium ${page===totalPages ? 'text-slate-300 border-slate-200' : 'text-slate-800 bg-white border-slate-500 hover:bg-slate-50'}`}
                      disabled={page===totalPages}
                      onClick={()=>setPage(p=>Math.min(totalPages,p+1))}
                      aria-label="Next page"
                    >
                      Next <ArrowRight className="w-4 h-4" />
                    </button>
                    <select className="border border-slate-400 rounded px-2 py-1 text-sm text-slate-800 ml-2" value={page} onChange={e=>setPage(parseInt(e.target.value)||1)}>
                      {Array.from({length: totalPages}, (_,i)=>i+1).slice(0,500).map(n=> (
                        <option key={n} value={n}>Page {n}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="w-full px-6 py-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-slate-600">Database: Connected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-slate-600">Dialfire API: Connected</span>
              </div>
            </div>
            <span className="text-slate-400">v1.0 • Internal Preview</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function CallRow({ call, index }: { call: any; index: number }) {
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAudio, setShowAudio] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyIdToClipboard = async () => {
    const fullId = String(call.id || '')
    if (!fullId) return
    
    try {
      await navigator.clipboard.writeText(fullId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy ID:', err)
    }
  }

  const startTranscription = async () => {
    if (!call.recordingUrl) {
      setError('No recording URL available')
      return
    }
    setError(null)
    setTranscribing(true)
    try {
      const submit = await fetch(`/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ audioUrl: call.recordingUrl })
      })
      if (!submit.ok) throw new Error('Failed to submit transcription')
      const { audioFileId } = await submit.json()
      // poll status briefly here for UX; production could offload
      const max = 6
      for (let i = 0; i < max; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const statusRes = await fetch(`/api/transcribe/${audioFileId}/status`, { credentials: 'include' })
        if (!statusRes.ok) continue
        const status = await statusRes.json()
        if (status.status === 'completed' && status.transcript) {
          setTranscript(status.transcript)
          break
        }
        if (status.status === 'failed') {
          setError(status?.metadata?.error || 'Transcription failed')
          break
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Transcription error')
    } finally {
      setTranscribing(false)
    }
  }

  const dt = new Date(call.callStart)
  const datum = isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString()
  const zeit = isNaN(dt.getTime()) ? '—' : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dauerSec = Math.round(call.duration || 0)
  const dauer = `${Math.floor(dauerSec/60)}:${(dauerSec%60).toString().padStart(2,'0')}`
  const firm = call.companyName || call.contactName || '—'
  const person = call.contactPerson || '—'
  
  // Show shortened ID (last 8 chars) with full ID on hover
  const fullId = String(call.id || '')
  const shortId = fullId.slice(-8) || '—'

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td 
          className="py-3 px-4 text-slate-700 tabular-nums font-mono text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors relative group" 
          title={copied ? 'Copied!' : `Click to copy: ${fullId}`}
          onClick={copyIdToClipboard}
        >
          <span className="relative">
            {shortId}
            {copied && (
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                Copied!
              </span>
            )}
          </span>
        </td>
        <td className="py-3 px-4 text-slate-700">{datum}</td>
        <td className="py-3 px-4 text-slate-700">{zeit}</td>
        <td className="py-3 px-4 text-slate-700 tabular-nums">{dauer}</td>
        <td className="py-3 px-4">
          {call.recordingUrl ? (
            <a
              href={call.recordingUrl}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center justify-center w-9 h-8 text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
              aria-label="Download audio file"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </a>
          ) : (
            <span className="inline-flex items-center justify-center w-9 h-8 text-slate-300 border border-slate-200 rounded cursor-not-allowed" title="No audio">
              <Download className="w-4 h-4" />
            </span>
          )}
        </td>
        <td className="py-3 px-4 text-slate-800">{firm}</td>
        <td className="py-3 px-4 text-slate-600">{person}</td>
        <td className="py-3 px-4 text-center">
          <button className={`p-1 rounded ${call.recordingUrl ? 'hover:bg-slate-100 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`} onClick={() => call.recordingUrl && setShowAudio(v=>!v)}><Volume2 className="w-4 h-4" /></button>
        </td>
        <td className="py-3 px-4 text-center">
          <button className={`p-1 rounded hover:bg-slate-100 ${transcribing ? 'text-slate-300' : 'text-slate-700'}`} onClick={startTranscription} disabled={transcribing}><FileText className="w-4 h-4" /></button>
        </td>
        <td className="py-3 px-4 text-center">
          <button className={`p-1 rounded ${call.notes ? 'hover:bg-slate-100 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`} onClick={() => call.notes && setShowNotes(v=>!v)}><StickyNote className="w-4 h-4" /></button>
        </td>
      </tr>
      {(showAudio && call.recordingUrl) && (
        <tr>
          <td colSpan={10} className="px-4 pb-3">
            <audio controls src={call.recordingUrl} className="h-8" />
          </td>
        </tr>
      )}
      {error && (
        <tr><td colSpan={10} className="px-4 text-sm text-red-600">{error}</td></tr>
      )}
      {transcript && (
        <tr><td colSpan={10} className="px-4">
          <div className="text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded p-3 whitespace-pre-wrap">{transcript}</div>
        </td></tr>
      )}
      {(showNotes && call.notes) && (
        <tr><td colSpan={10} className="px-4">
          <div className="text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded p-3 whitespace-pre-wrap">{normalizeNotes(String(call.notes))}</div>
        </td></tr>
      )}
    </>
  )
}
