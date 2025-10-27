'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { HelpCircle, Bell, User, ChevronDown, ArrowLeft, ArrowRight, Volume2, FileText, StickyNote, Download } from 'lucide-react'

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
  const [agentName, setAgentName] = useState('')
  const [showHeader, setShowHeader] = useState(true)
  
  // Call data state
  const [calls, setCalls] = useState<any[]>([])
  const [stats, setStats] = useState<any | null>(null)
  const [serverTotal, setServerTotal] = useState<number | null>(null)
  const [serverGrouped, setServerGrouped] = useState<null | { negativ: Record<string, number>; positiv: Record<string, number>; offen: Record<string, number> }>(null)
  const [view, setView] = useState<'overview'|'details'>('details')
  const [selectedCategory, setSelectedCategory] = useState<null | 'positiv' | 'negativ' | 'offen'>(null)
  const [selectedSub, setSelectedSub] = useState<string | null>(null)
  const [filterCalls, setFilterCalls] = useState<'alle' | 'mit_audio' | 'mit_transkript' | 'mit_notizen'>('alle')
  const [filterTime, setFilterTime] = useState<'alle' | 'heute' | 'woche' | 'monat'>('alle')
  const [page, setPage] = useState(1)
  const pageSize = 100

  // Get filter params from URL
  const agentId = searchParams.get('agentId') || ''
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

  // Load campaign and agent names
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
          const agents = await agentsRes.json()
          const projects = await projectsRes.json()
          
          const agent = agents.find((a: any) => a.id === agentId)
          const project = projects.find((p: any) => p.id === campaignId)
          
          setAgentName(agent?.name?.replace(/\./g, ' ') || agentId)
          setCampaignName(project?.name || campaignId)
        }
      } catch (e) {
        console.error('Failed to load metadata:', e)
      }
    }
    loadMetadata()
    return () => { cancelled = true }
  }, [campaignId, agentId])

  // Load call details
  useEffect(() => {
    let cancelled = false
    const loadCalls = async () => {
      if (!agentId || !campaignId) return
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (dateFrom) params.append('dateFrom', dateFrom)
        if (dateTo) params.append('dateTo', dateTo)
        if (timeFrom) params.append('timeFrom', timeFrom)
        if (timeTo) params.append('timeTo', timeTo)
        
        const url = `/api/call-details/${agentId}/${campaignId}?${params.toString()}`
        const res = await fetch(url, { credentials: 'include' })
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
            
            const sum = (obj: Record<string, number>) => Object.values(obj || {}).reduce((acc: number, n: any) => acc + Number(n || 0), 0)
            const total = sum(map.positiv||{}) + sum(map.negativ||{}) + sum(map.offen||{})
            setStats({
              anzahl: total,
              abgeschlossen: sum(map.negativ||{}) + sum(map.positiv||{}),
              erfolgreich: sum(map.positiv||{}),
              gespraechszeit: 0,
              arbeitszeit: 0
            })
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadCalls()
    return () => { cancelled = true }
  }, [agentId, campaignId, dateFrom, dateTo, timeFrom, timeTo])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [selectedCategory, selectedSub, filterCalls, filterTime])

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
  }, [calls, selectedCategory, selectedSub, filterCalls, filterTime])

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
          {/* Title and Filter Info */}
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-2xl font-semibold text-slate-900">{campaignName}</h1>
              <button 
                onClick={() => router.back()} 
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                ← Back
              </button>
            </div>
            
            {/* Filter indicators */}
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">Agent:</span>
                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200">{agentName}</span>
              </div>
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
          </div>

          {/* Statistics Summary */}
          {stats && (
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <div className="text-sm text-slate-600">Anzahl</div>
                  <div className="text-xl font-semibold text-slate-900 tabular-nums">{stats.anzahl?.toLocaleString?.() || 0}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600">abgeschlossen</div>
                  <div className="text-xl font-semibold text-slate-900 tabular-nums">{stats.abgeschlossen || 0}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600">erfolgreich</div>
                  <div className="text-xl font-semibold text-emerald-600 tabular-nums">{stats.erfolgreich || 0}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600">GZ (h)</div>
                  <div className="text-xl font-semibold text-slate-900 tabular-nums">{(stats.gespraechszeit || 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600">AZ (h)</div>
                  <div className="text-xl font-semibold text-slate-900 tabular-nums">{(stats.arbeitszeit || 0).toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Overview/Details Toggle */}
          <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="inline-flex items-center rounded border border-slate-300 overflow-hidden">
              <button
                className={`px-4 py-2 text-sm font-medium ${view === 'overview' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                onClick={() => setView('overview')}
              >
                Overview
              </button>
              <div className="w-px h-6 bg-slate-300" />
              <button
                className={`px-4 py-2 text-sm font-medium ${view === 'details' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                onClick={() => setView('details')}
              >
                Details
              </button>
            </div>
            <div className="text-sm text-slate-600">
              {loading ? 'Loading...' : `${overallTotal.toLocaleString()} calls`}
            </div>
          </div>

          {/* Call Details Content */}
          <div className="p-6">
            {loading ? (
              <div className="p-8 text-center text-slate-600">Loading call details...</div>
            ) : calls.length === 0 ? (
              <div className="p-8 text-center text-slate-600">No calls found for this campaign and agent combination.</div>
            ) : (
              <>
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
                  <div className="flex items-center gap-3 text-sm">
                    <label className="text-slate-600 font-medium">Anrufe:</label>
                    <select className="border border-slate-300 rounded px-3 py-1.5" value={filterCalls} onChange={e=>setFilterCalls(e.target.value as any)}>
                      <option value="alle">Alle Anrufe</option>
                      <option value="mit_audio">Mit Audio</option>
                      <option value="mit_transkript">Mit Transkript</option>
                      <option value="mit_notizen">Mit Notizen</option>
                    </select>
                    <label className="text-slate-600 font-medium ml-3">Zeiten:</label>
                    <select className="border border-slate-300 rounded px-3 py-1.5" value={filterTime} onChange={e=>setFilterTime(e.target.value as any)}>
                      <option value="alle">Alle Zeiten</option>
                      <option value="heute">Heute</option>
                      <option value="woche">Diese Woche</option>
                      <option value="monat">Dieser Monat</option>
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

                {/* Call Details Table */}
                {view === 'details' && (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 text-left font-medium">Nr</th>
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
                )}

                {/* Overview mode */}
                {view === 'overview' && (
                  <div className="text-center py-12 text-slate-600">
                    <p className="text-lg">Overview view is under development.</p>
                    <p className="text-sm mt-2">Please use Details view to see call records.</p>
                  </div>
                )}
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

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="py-3 px-4 text-slate-700 tabular-nums">{index}</td>
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
