'use client'

// Force dynamic rendering for this page (uses useSearchParams)
export const dynamic = 'force-dynamic'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Volume2, FileText, StickyNote, Download, Filter, Clock, Calendar, CalendarClock } from 'lucide-react'
import { Footer } from '@/components/Footer'
import { useLanguage } from '@/contexts/LanguageContext'
import { InlineCalendar } from '@/components/InlineCalendar'
import { format } from 'date-fns'

// Normalize notes text: convert literal "\\n" (and "\\r\\n") sequences into real line breaks
function normalizeNotes(text: string): string {
  return text.replace(/\\r\\n|\\n|\\r/g, '\n')
}

export default function CampaignDetailPage() {
  const { t } = useLanguage()
  const { campaignId } = useParams<{ campaignId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [agentsInitialized, setAgentsInitialized] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  
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
  // Get filter params from URL (must be declared before state that uses them)
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const timeFrom = searchParams.get('timeFrom') || undefined
  const timeTo = searchParams.get('timeTo') || undefined

  const [filterCalls, setFilterCalls] = useState<'alle' | 'mit_audio' | 'mit_transkript' | 'mit_notizen'>('alle')
  const [filterTime, setFilterTime] = useState<'alle' | 'heute' | 'woche' | 'monat'>('alle')
  const [filterDuration, setFilterDuration] = useState<'alle' | '0-30s' | '30-60s' | '1-5min' | '5-10min' | '10+min'>('alle')
  const [page, setPage] = useState(1)
  const pageSize = 100

  // Date filter popover state
  const [showFilterPopover, setShowFilterPopover] = useState(false)
  const filterRef = useRef<HTMLDivElement | null>(null)
  const [dateFromDisplay, setDateFromDisplay] = useState<string>(dateFrom || '')
  const [dateToDisplay, setDateToDisplay] = useState<string>(dateTo || '')
  const [showFromCal, setShowFromCal] = useState(false)
  const [showToCal, setShowToCal] = useState(false)
  const [fromMonth, setFromMonth] = useState<number>(new Date().getMonth())
  const [fromYear, setFromYear] = useState<number>(new Date().getFullYear())
  const [toMonth, setToMonth] = useState<number>(new Date().getMonth())
  const [toYear, setToYear] = useState<number>(new Date().getFullYear())

  // Build display strings for filters
  const dateRangeText = (dateFrom && dateTo)
    ? `${dateFrom} → ${dateTo}`
    : (dateFrom ? dateFrom : (dateTo ? dateTo : 'All dates'))
  const timeRangeText = (timeFrom || timeTo)
    ? `${timeFrom || '00:00'}–${timeTo || '23:59'}`
    : 'All times'

  const backCampaignsHref = useMemo(() => {
    const p = new URLSearchParams()
    p.set('view','campaigns')
    const df = searchParams.get('dateFrom'); if (df) p.set('dateFrom', df)
    const dt = searchParams.get('dateTo'); if (dt) p.set('dateTo', dt)
    const tf = searchParams.get('timeFrom'); if (tf) p.set('timeFrom', tf)
    const tt = searchParams.get('timeTo'); if (tt) p.set('timeTo', tt)
    const ag = searchParams.get('agentId'); if (ag) p.set('agents', ag)
    return `/dashboard?${p.toString()}`
  }, [searchParams])

  // Date filter helper functions
  useEffect(() => {
    setDateFromDisplay(dateFrom || '')
    setDateToDisplay(dateTo || '')
  }, [dateFrom, dateTo])

  useEffect(() => {
    function onPointer(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null
      if (showFilterPopover && filterRef.current && t && !filterRef.current.contains(t)) {
        setShowFilterPopover(false)
        setShowFromCal(false)
        setShowToCal(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowFilterPopover(false)
        setShowFromCal(false)
        setShowToCal(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [showFilterPopover])

  const isoToDisplay = (iso: string) => {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${d.padStart(2,'0')} - ${m.padStart(2,'0')} - ${y}`
  }
  const displayToIso = (display: string): string => {
    const compact = display.replace(/\s+/g, '')
    const parts = compact.split('-')
    if (parts.length !== 3) return ''
    const [dd, mm, yyyy] = parts
    if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return ''
    const day = parseInt(dd, 10), mon = parseInt(mm, 10)
    if (isNaN(day) || isNaN(mon) || day < 1 || day > 31 || mon < 1 || mon > 12) return ''
    return `${yyyy}-${mm}-${dd}`
  }
  const dateToIsoLocal = (d: Date) => {
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const setQuickDate = (range: 'today'|'week'|'month') => {
    const today = new Date()
    const formatted = format(today, 'yyyy-MM-dd')
    if (range === 'today') {
      setDateFromDisplay(isoToDisplay(formatted))
      setDateToDisplay(isoToDisplay(formatted))
      return
    }
    if (range === 'week') {
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay())
      const fromIso = format(weekStart, 'yyyy-MM-dd')
      setDateFromDisplay(isoToDisplay(fromIso))
      setDateToDisplay(isoToDisplay(formatted))
      return
    }
    if (range === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const fromIso = format(monthStart, 'yyyy-MM-dd')
      setDateFromDisplay(isoToDisplay(fromIso))
      setDateToDisplay(isoToDisplay(formatted))
    }
  }

  const applyFilters = () => {
    const df = displayToIso(dateFromDisplay)
    const dt = displayToIso(dateToDisplay)
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    if (df) params.set('dateFrom', df)
    else params.delete('dateFrom')
    if (dt) params.set('dateTo', dt)
    else params.delete('dateTo')
    router.push(`?${params.toString()}`)
    setShowFilterPopover(false)
  }

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
        
        if (!agentsRes.ok || !projectsRes.ok) {
          console.error('Failed to fetch metadata:', !agentsRes.ok ? 'agents' : 'projects')
          setAgentsInitialized(true)
          return
        }
        
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
          
          if (!statsRes.ok) {
            console.error('Failed to fetch statistics for campaign agents')
            setAgentsInitialized(true)
            return
          }
          
          if (statsRes.ok && !cancelled) {
            const statsData = await statsRes.json()
            // Extract unique agent IDs from statistics
            const agentIdsWithData = [...new Set(statsData.map((s: any) => s.agentId))]
            
            // Filter to agents that have statistics for this campaign
            // Exclude team leaders (identified by spaces in their names instead of dots)
            const campaignAgents = allAgents.filter((agent: any) => 
              agentIdsWithData.includes(agent.id) && !agent.name.includes(' ')
            )
            
            const formattedAgents = campaignAgents.map((a: any) => ({
              id: a.id,
              name: a.name.replace(/\./g, ' ')
            }))
            
            setAvailableAgents(formattedAgents)
            // If navigated from an Agent page with agentId param, preselect only that agent; else select all
            const fromAgentId = searchParams.get('agentId')
            if (fromAgentId && formattedAgents.some((a: any) => a.id === fromAgentId)) {
              setSelectedAgentIds([fromAgentId])
            } else {
              setSelectedAgentIds(formattedAgents.map((a: { id: string }) => a.id))
            }
            setAgentsInitialized(true)
          }
        }
      } catch (e) {
        console.error('Failed to load metadata:', e)
        setAgentsInitialized(true)
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
        // Only set loading to false if agents have been initialized
        // This prevents showing "no calls found" while waiting for initial metadata load
        if (agentsInitialized) {
          setLoading(false)
        }
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
  }, [selectedAgentIds, campaignId, dateFrom, dateTo, timeFrom, timeTo, agentsInitialized])

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

  const filteredCount = filteredCalls.length
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize))
  const startIdx = (page - 1) * pageSize
  const endIdx = Math.min(startIdx + pageSize, filteredCount)
  const visibleCalls = filteredCalls.slice(startIdx, endIdx)

  return (
    <>
      <main className="flex-1 w-full px-6 py-8">
        <div className="bg-white rounded-lg shadow-md">
          {/* Title, Toggle, and Filter Info */}
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-xl font-semibold text-slate-900">{campaignName}</h1>
              <div className="flex items-center gap-3">
                {/* Overview/Details Toggle */}
                <div className="inline-flex items-center rounded border border-slate-300 overflow-hidden">
                  <button
                    className={`px-3 py-1.5 text-sm font-medium ${statsView === 'overview' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                    onClick={() => setStatsView('overview')}
                  >
                    {t('campaign.overview')}
                  </button>
                  <div className="w-px h-6 bg-slate-300" />
                  <button
                    className={`px-3 py-1.5 text-sm font-medium ${statsView === 'details' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                    onClick={() => setStatsView('details')}
                  >
                    {t('campaign.details')}
                  </button>
                </div>
                {/* Change Period Button */}
                <div className="relative" ref={filterRef}>
                  <button
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 bg-white hover:bg-slate-50"
                    onClick={() => setShowFilterPopover(v=>!v)}
                    data-testid="button-change-period"
                  >
                    <CalendarClock className="w-4 h-4" /> {t('agent.changePeriod')}
                  </button>
                  {showFilterPopover && (
                    <div className="absolute right-0 z-20 mt-2 w-[560px] max-w-[92vw] bg-white border border-slate-200 rounded-lg shadow-xl p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                          <label className="block text-sm font-medium text-slate-700 mb-1"><Calendar className="inline w-4 h-4 mr-2" />{t('search.from')}</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="dd - mm - yyyy"
                            value={dateFromDisplay}
                            onChange={(e)=>{ const v=e.target.value; setDateFromDisplay(v) }}
                            onFocus={() => setShowFromCal(true)}
                            onBlur={() => { if (dateFrom) setDateFromDisplay(isoToDisplay(dateFrom)) }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 placeholder:text-slate-500"
                          />
                          {showFromCal && (
                            <div className="absolute z-30 mt-2 w-full">
                              <InlineCalendar
                                value={dateFrom ? new Date(dateFrom) : null}
                                onChange={(d)=>{ const iso = dateToIsoLocal(d); setDateFromDisplay(isoToDisplay(iso)); setShowFromCal(false) }}
                                visibleMonth={fromMonth}
                                visibleYear={fromYear}
                                onMonthChange={setFromMonth}
                                onYearChange={setFromYear}
                              />
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <label className="block text-sm font-medium text-slate-700 mb-1"><Calendar className="inline w-4 h-4 mr-2" />{t('search.to')}</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="dd - mm - yyyy"
                            value={dateToDisplay}
                            onChange={(e)=>{ const v=e.target.value; setDateToDisplay(v) }}
                            onFocus={() => setShowToCal(true)}
                            onBlur={() => { if (dateTo) setDateToDisplay(isoToDisplay(dateTo)) }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 placeholder:text-slate-500"
                          />
                          {showToCal && (
                            <div className="absolute z-30 mt-2 w-full">
                              <InlineCalendar
                                value={dateTo ? new Date(dateTo) : null}
                                onChange={(d)=>{ const iso = dateToIsoLocal(d); setDateToDisplay(isoToDisplay(iso)); setShowToCal(false) }}
                                visibleMonth={toMonth}
                                visibleYear={toYear}
                                onMonthChange={setToMonth}
                                onYearChange={setToYear}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => setQuickDate('today')}
                          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
                        >
                          {t('search.today')}
                        </button>
                        <button
                          onClick={() => setQuickDate('week')}
                          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
                        >
                          {t('search.thisWeek')}
                        </button>
                        <button
                          onClick={() => setQuickDate('month')}
                          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
                        >
                          {t('search.thisMonth')}
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={() => {
                            setDateFromDisplay('')
                            setDateToDisplay('')
                            const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
                            params.delete('dateFrom')
                            params.delete('dateTo')
                            router.push(`?${params.toString()}`)
                            setShowFilterPopover(false)
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
                        >
                          {t('search.clear')}
                        </button>
                        <button
                          onClick={applyFilters}
                          className="px-4 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                        >
                          {t('search.searchStatistics')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <a
                href={backCampaignsHref}
                onClick={(e)=>{ try { if (document.referrer && new URL(document.referrer).origin === window.location.origin) { e.preventDefault(); window.history.back(); } } catch {} }}
                className="text-sm text-slate-800 hover:underline underline-offset-2"
              >
                ← {t('campaign.backToCampaigns')}
              </a>
            </div>
            
            {/* Agent Filter Chips */}
            {availableAgents.length > 0 && (
              <div className="mb-4">
                <span className="text-sm font-medium text-slate-700 block mb-2">{t('campaign.agents')}</span>
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
                    {t('campaign.all')} <span className="ml-1 opacity-70">({availableAgents.length})</span>
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
                      <div className="text-sm text-slate-600">{t('campaign.totalCalls')}</div>
                      <div className="text-lg font-semibold text-slate-900 tabular-nums">{stats.calls?.toLocaleString?.() || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">{t('campaign.reachPercent')}</div>
                      <div className="text-lg font-semibold text-slate-900 tabular-nums">
                        {stats.calls ? ((stats.completed / stats.calls) * 100).toFixed(1) : '0.0'}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">{t('campaign.positiveOutcomes')}</div>
                      <div className="text-lg font-semibold text-emerald-600 tabular-nums">{stats.success || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">{t('campaign.avgDurationMin')}</div>
                      <div className="text-lg font-semibold text-slate-900 tabular-nums">
                        {stats.completed ? (stats.gz / stats.completed).toFixed(2) : '0.00'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">{t('campaign.status')}</div>
                      <div>
                        {campaignStatus && (
                          <span className={`text-xs px-2 py-1 rounded-full border ${campaignStatus==='active'?'bg-emerald-50 text-emerald-700 border-emerald-200': campaignStatus==='new'?'bg-blue-50 text-blue-700 border-blue-200':'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {t(`campaign.${campaignStatus}`)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3">
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.anzahl')}</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{stats.calls?.toLocaleString?.() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.abgeschlossen')}</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{stats.completed || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.erfolgreich')}</div>
                      <div className="text-base font-semibold text-emerald-600 tabular-nums">{stats.success || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.wzh')}</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.wz || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.gzh')}</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.gz || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.nbzh')}</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.nbz || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.vbzh')}</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.vbz || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.erfolgProStunde')}</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">
                        {stats.az ? (stats.success / stats.az).toFixed(2) : '0.00'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.azh')}</div>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">{(stats.az || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">{t('campaign.status')}</div>
                      <div>
                        {campaignStatus && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${campaignStatus==='active'?'bg-emerald-50 text-emerald-700 border-emerald-200': campaignStatus==='new'?'bg-blue-50 text-blue-700 border-blue-200':'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {t(`campaign.${campaignStatus}`)}
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
              <div className="p-8 text-center text-slate-600">{t('campaign.loadingCallDetails')}</div>
            ) : calls.length === 0 ? (
              <div className="p-8 text-center text-slate-600">{t('campaign.noCallsFound')}</div>
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
                    <div className="text-sm text-slate-700 font-semibold">{filteredCount.toLocaleString()} {t('campaign.results')}</div>
                    <div className="flex items-center gap-2 text-sm text-slate-800">
                      <button
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border font-medium ${page===1 ? 'text-slate-300 border-slate-200' : 'text-slate-800 bg-white border-slate-500 hover:bg-slate-50'}`}
                        disabled={page===1}
                        onClick={()=>setPage(p=>Math.max(1,p-1))}
                        aria-label="Previous page"
                      >
                        <ArrowLeft className="w-4 h-4" /> Prev
                      </button>
                      <span className="px-2 tabular-nums font-medium">{startIdx+1}–{endIdx} / {filteredCount.toLocaleString()}</span>
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
                        <th className="py-3 px-4 text-left font-medium">{t('campaign.id')}</th>
                        <th className="py-3 px-4 text-left font-medium">{t('campaign.agent')}</th>
                        <th className="py-3 px-4 text-left font-medium">{t('campaign.date')}</th>
                        <th className="py-3 px-4 text-left font-medium">{t('campaign.time')}</th>
                        <th className="py-3 px-4 text-left font-medium">{t('campaign.duration')}</th>
                        <th className="py-3 px-4 text-left font-medium">{t('campaign.audioDownload')}</th>
                        <th className="py-3 px-4 text-left font-medium">{t('campaign.companyName')}</th>
                        <th className="py-3 px-4 text-left font-medium">{t('campaign.contactPerson')}</th>
                        <th className="py-3 px-4 text-center font-medium">A</th>
                        <th className="py-3 px-4 text-center font-medium">T</th>
                        <th className="py-3 px-4 text-center font-medium">N</th>
                        <th className="py-3 px-4 text-center font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {visibleCalls.map((c, idx) => (
                        <CallRow key={c.id || (startIdx+idx)} index={startIdx+idx+1} call={c} availableAgents={availableAgents} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Pagination */}
                <div className="flex items-center justify-end gap-3 mt-4">
                  <div className="text-sm text-slate-700 font-semibold">{filteredCount.toLocaleString()} {t('campaign.results')}</div>
                  <div className="flex items-center gap-2 text-sm text-slate-800">
                    <button
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border font-medium ${page===1 ? 'text-slate-300 border-slate-200' : 'text-slate-800 bg-white border-slate-500 hover:bg-slate-50'}`}
                      disabled={page===1}
                      onClick={()=>setPage(p=>Math.max(1,p-1))}
                      aria-label="Previous page"
                    >
                      <ArrowLeft className="w-4 h-4" /> {t('campaign.prev')}
                    </button>
                    <span className="px-2 tabular-nums font-medium">{startIdx+1}–{endIdx} / {filteredCount.toLocaleString()}</span>
                    <button
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border font-medium ${page===totalPages ? 'text-slate-300 border-slate-200' : 'text-slate-800 bg-white border-slate-500 hover:bg-slate-50'}`}
                      disabled={page===totalPages}
                      onClick={()=>setPage(p=>Math.min(totalPages,p+1))}
                      aria-label="Next page"
                    >
                      {t('campaign.next')} <ArrowRight className="w-4 h-4" />
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
      <Footer />
    </>
  )
}

function CallRow({ call, index, availableAgents }: { call: any; index: number; availableAgents: { id: string; name: string }[] }) {
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAudio, setShowAudio] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [opening, setOpening] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // Find agent name from agentId
  const agent = availableAgents.find(a => a.id === call.agentId)
  const agentName = agent?.name || '—'

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
      
      if (!submit.ok) {
        let errorMessage = 'Failed to submit transcription'
        try {
          const errorData = await submit.json()
          errorMessage = errorData.message || errorData.error || errorMessage
        } catch {
          // If response is not JSON, use default error message
          errorMessage = `Server error: ${submit.status} ${submit.statusText}`
        }
        throw new Error(errorMessage)
      }
      
      let submitData
      try {
        submitData = await submit.json()
      } catch {
        throw new Error('Invalid response from server')
      }
      
      if (!submitData.audio_file_id) {
        throw new Error('No transcription job ID returned')
      }
      
      const audioFileId = submitData.audio_file_id
      
      // poll status briefly here for UX; production could offload
      const max = 6
      for (let i = 0; i < max; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const statusRes = await fetch(`/api/transcribe/${audioFileId}/status`, { credentials: 'include' })
        if (!statusRes.ok) {
          console.warn('Status check failed, retrying...')
          continue
        }
        
        let status
        try {
          status = await statusRes.json()
        } catch {
          console.warn('Invalid JSON from status endpoint, retrying...')
          continue
        }
        
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
      console.error('Transcription error:', e)
      setError(e?.message || 'Transcription error')
    } finally {
      setTranscribing(false)
    }
  }

  const openDetails = async () => {
    try {
      setOpening(true)
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
      const agentId = String(call.agentId || '')
      const projectId = String(call.projectId || '')
      const dateFrom = params.get('dateFrom') || ''
      const dateTo = params.get('dateTo') || ''
      const timeFrom = params.get('timeFrom') || ''
      const timeTo = params.get('timeTo') || ''
      const sp = new URLSearchParams()
      if (agentId) sp.set('agentId', agentId)
      if (projectId) sp.set('projectId', projectId)
      if (dateFrom) sp.set('dateFrom', dateFrom)
      if (dateTo) sp.set('dateTo', dateTo)
      if (timeFrom) sp.set('timeFrom', timeFrom)
      if (timeTo) sp.set('timeTo', timeTo)
      window.location.href = `/call/${encodeURIComponent(call.id)}?${sp.toString()}`
    } finally {
      setOpening(false)
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
      <tr className="hover:bg-slate-50 align-middle">
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
        <td className="py-3 px-4 text-slate-700">{agentName}</td>
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
          <button className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${transcribing ? 'text-slate-300 border-slate-200' : 'text-slate-700 border-slate-300 hover:bg-slate-50'}`} onClick={startTranscription} disabled={transcribing}>
            {transcribing ? (
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden></span><span className="text-xs">Transcribing…</span></span>
            ) : (
              <span className="inline-flex items-center gap-1"><FileText className="w-4 h-4" /><span className="text-xs">Transcribe</span></span>
            )}
          </button>
        </td>
        <td className="py-3 px-4 text-center">
          <button className={`p-1 rounded ${call.notes ? 'hover:bg-slate-100 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`} onClick={() => call.notes && setShowNotes(v=>!v)}><StickyNote className="w-4 h-4" /></button>
        </td>
        <td className="py-3 px-4 text-center">
          <button className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50" onClick={openDetails} disabled={opening}>View</button>
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
