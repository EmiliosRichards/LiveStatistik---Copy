'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAutoHideHeader } from '@/lib/useAutoHideHeader'
import { Calendar, Users, Briefcase, ChevronDown, Search, HelpCircle, Bell, User, CalendarClock, Layers } from 'lucide-react'
import { format } from 'date-fns'
import { fetchAgents, fetchProjectsForAgents, type Agent, type Project } from '@/lib/api'
import { InlineCalendar } from '@/components/InlineCalendar'

export default function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const showHeader = useAutoHideHeader(24, 24)
  const headerRef = useRef<HTMLElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const recalc = () => { if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight || 0) }
    recalc(); window.addEventListener('resize', recalc); return () => window.removeEventListener('resize', recalc)
  }, [])
  const [searchType, setSearchType] = useState<'agent' | 'project'>('agent')
  // Internal ISO values (yyyy-mm-dd) used for queries
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Display values for inputs (dd-mm-yyyy)
  const [dateFromDisplay, setDateFromDisplay] = useState('')
  const [dateToDisplay, setDateToDisplay] = useState('')
  // Removed time filters per request
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [agentSearch, setAgentSearch] = useState('')
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [projectFilter, setProjectFilter] = useState<'all'|'active'|'new'|'archived'>('all')
  // Calendar UI state
  const [showFromCal, setShowFromCal] = useState(false)
  const [showToCal, setShowToCal] = useState(false)
  const [fromMonth, setFromMonth] = useState<number>(new Date().getMonth())
  const [fromYear, setFromYear] = useState<number>(new Date().getFullYear())
  const [toMonth, setToMonth] = useState<number>(new Date().getMonth())
  const [toYear, setToYear] = useState<number>(new Date().getFullYear())
  const fromRef = useRef<HTMLDivElement | null>(null)
  const toRef = useRef<HTMLDivElement | null>(null)
  const agentRef = useRef<HTMLDivElement | null>(null)
  const projectRef = useRef<HTMLDivElement | null>(null)

  // Close calendars on outside click or Escape
  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (showFromCal && fromRef.current && target && !fromRef.current.contains(target)) {
        setShowFromCal(false)
      }
      if (showToCal && toRef.current && target && !toRef.current.contains(target)) {
        setShowToCal(false)
      }
      if (showAgentDropdown && agentRef.current && target && !agentRef.current.contains(target)) {
        setShowAgentDropdown(false)
      }
      if (showProjectDropdown && projectRef.current && target && !projectRef.current.contains(target)) {
        setShowProjectDropdown(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowFromCal(false)
        setShowToCal(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showFromCal, showToCal, showAgentDropdown, showProjectDropdown])

  const isFormValid = dateFrom && dateTo && (
    (searchType === 'agent' && selectedAgents.length > 0) ||
    (searchType === 'project' && selectedProjects.length > 0)
  )

  // header visibility handled by hook

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    if (searchType === 'project') {
      loadAllProjects()
    }
  }, [searchType])

  const loadAgents = async () => {
    setLoadingAgents(true)
    try {
      const data = await fetchAgents()
      setAgents(data)
    } catch (error) {
      console.error('Failed to load agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }

  const loadProjects = async () => {
    setLoadingProjects(true)
    try {
      const data = await fetchProjectsForAgents(selectedAgents)
      setProjects(data)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoadingProjects(false)
    }
  }

  const loadAllProjects = async () => {
    setLoadingProjects(true)
    try {
      const { fetchProjects: fetchAllProjects } = await import('@/lib/api')
      const data = await fetchAllProjects()
      setProjects(data)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoadingProjects(false)
    }
  }

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    )
  }

  const toggleProject = (projectId: string) => {
    setSelectedProjects(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
  }

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(agentSearch.toLowerCase())
  )

  const filteredProjects = projects.filter((p: any) => {
    if (projectFilter === 'all') return true
    if (projectFilter === 'active') return p.status === 'active' || p.status === 'new'
    return p.status === projectFilter
  })

  const handleSearch = async () => {
    if (!isFormValid) return
    const params = new URLSearchParams({
      type: searchType,
      dateFrom,
      dateTo,
      ...(selectedAgents.length > 0 && { agents: selectedAgents.join(',') }),
      ...(selectedProjects.length > 0 && { projects: selectedProjects.join(',') })
    })
    try { sessionStorage.setItem('timeSearch:lastParams', params.toString()) } catch {}
    const cacheKey = `results:${Date.now()}`
    setSubmitting(true)
    try {
      const { fetchStatistics, fetchAgents: fetchAllAgents, fetchProjects: fetchAllProjects } = await import('@/lib/api')
      const agentIds = selectedAgents
      const projectIds = selectedProjects.length > 0 ? selectedProjects : undefined
      const [stats, aList, pList] = await Promise.all([
        fetchStatistics({ agentIds, projectIds, dateFrom, dateTo }),
        fetchAllAgents(),
        fetchAllProjects()
      ])
      const cachePayload = { statistics: stats, agents: aList, projects: pList }
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(cachePayload))
      } catch {}
      router.push(`/dashboard/results?${params.toString()}&cache=${encodeURIComponent(cacheKey)}`)
    } catch (e) {
      // On error, still navigate; results page will handle fetch
      router.push(`/dashboard/results?${params.toString()}`)
    } finally {
      // overlay will disappear on navigation; keep it until push completes
      setSubmitting(false)
    }
  }

  const clearFilters = () => {
    setDateFrom(''); setDateTo('')
    setDateFromDisplay(''); setDateToDisplay('')
    setSelectedAgents([]); setSelectedProjects([])
    setAgentSearch('')
    try { sessionStorage.removeItem('timeSearch:lastParams') } catch {}
    try { router.replace('/dashboard/search') } catch {}
  }

  // Helpers for dd-mm-yyyy <-> ISO yyyy-mm-dd
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

  const setQuickDate = (range: 'today' | 'week' | 'month') => {
    const today = new Date()
    const formatted = format(today, 'yyyy-MM-dd')
    
    switch (range) {
      case 'today':
        setDateFrom(formatted); setDateFromDisplay(isoToDisplay(formatted))
        setDateTo(formatted); setDateToDisplay(isoToDisplay(formatted))
        break
      case 'week':
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay())
        {
          const fromIso = format(weekStart, 'yyyy-MM-dd')
          setDateFrom(fromIso); setDateFromDisplay(isoToDisplay(fromIso))
          setDateTo(formatted); setDateToDisplay(isoToDisplay(formatted))
        }
        break
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        {
          const fromIso = format(monthStart, 'yyyy-MM-dd')
          setDateFrom(fromIso); setDateFromDisplay(isoToDisplay(fromIso))
          setDateTo(formatted); setDateToDisplay(isoToDisplay(formatted))
        }
        break
    }
  }

  // Initialize from URL or session cache
  useEffect(() => {
    const sp = searchParams
    const fromUrl = !!(sp.get('dateFrom') || sp.get('dateTo') || sp.get('agents') || sp.get('projects') || sp.get('type'))
    const params = fromUrl ? sp : (() => {
      try { const prev = typeof window !== 'undefined' ? sessionStorage.getItem('timeSearch:lastParams') : null; return prev ? new URLSearchParams(prev) : undefined } catch { return undefined }
    })()
    if (!params) return
    const t = params.get('type') as 'agent'|'project'|null
    if (t === 'agent' || t === 'project') setSearchType(t)
    const df = params.get('dateFrom') || ''
    const dt = params.get('dateTo') || ''
    if (df) { setDateFrom(df); setDateFromDisplay(isoToDisplay(df)) }
    if (dt) { setDateTo(dt); setDateToDisplay(isoToDisplay(dt)) }
    const a = params.get('agents')
    if (a) setSelectedAgents(a.split(',').filter(Boolean))
    const p = params.get('projects')
    if (p) setSelectedProjects(p.split(',').filter(Boolean))
  }, [searchParams])

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <header ref={headerRef} className={`bg-bg-elevated border-b border-border sticky top-0 z-10 transition-transform duration-300 ${showHeader ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="w-full px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-3">
              <a href="/dashboard" className="inline-flex items-center" aria-label="Manuav Internal App">
                <img src="/Manuav-web-site-LOGO.png" alt="Manuav" className="h-8 w-auto invert" />
              </a>
              <h1 className="sr-only">Agent & Campaign Statistics</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Help" className="p-2 rounded hover:bg-slate-100" data-testid="button-help">
              <HelpCircle className="w-5 h-5 text-slate-700" />
            </button>
            <button aria-label="Notifications" className="relative p-2 rounded hover:bg-slate-100" data-testid="button-notifications">
              <Bell className="w-5 h-5 text-slate-700" />
              <span className="absolute -top-0.5 -right-0.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-red-500 text-white">1</span>
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button aria-label="Account" className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100" data-testid="button-account">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-4 h-4 text-slate-600" />
              </div>
              <span className="hidden sm:inline text-sm text-slate-700">Emilios</span>
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button className="text-sm text-slate-600 hover:text-slate-900" data-testid="button-language-de">DE</button>
            <span className="text-slate-300">|</span>
            <button className="text-sm text-slate-600 hover:text-slate-900" data-testid="button-language-en">EN</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full px-6 py-12" aria-busy={submitting} aria-live="polite">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 sticky self-start" style={{ top: showHeader ? headerHeight : 0, marginTop: showHeader ? 0 : -headerHeight }}>
            <div className="bg-bg-elevated rounded-lg shadow-md p-2">
              <nav className="space-y-1 text-slate-800">
                <a className="w-full block px-3 py-2 rounded hover:bg-slate-50 inline-flex items-center gap-2" href="/dashboard?view=dashboard"><Layers className="w-4 h-4" /> Dashboard</a>
                <a className="w-full block px-3 py-2 rounded hover:bg-slate-50 inline-flex items-center gap-2" href="/dashboard?view=agents"><Users className="w-4 h-4" /> Agents</a>
                <a className="w-full block px-3 py-2 rounded hover:bg-slate-50 inline-flex items-center gap-2" href="/dashboard?view=campaigns"><Layers className="w-4 h-4" /> Campaigns</a>
                <span className="w-full block px-3 py-2 rounded bg-slate-100 font-semibold border-l-4 border-blue-600 inline-flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Time-based Search</span>
              </nav>
            </div>
          </aside>

          {/* Search Card */}
          <div className="flex-1">
            <div className="bg-bg-elevated rounded-lg shadow-lg p-8">
          {/* Tabs */}
          <div className="flex gap-4 mb-8 border-b border-slate-200">
            <button
              onClick={() => setSearchType('agent')}
              className={`pb-3 px-4 font-medium transition-colors relative ${
                searchType === 'agent'
                  ? 'text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              data-testid="tab-agent-data"
            >
              Agent Data
              {searchType === 'agent' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
            <button
              onClick={() => setSearchType('project')}
              className={`pb-3 px-4 font-medium transition-colors relative ${
                searchType === 'project'
                  ? 'text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              data-testid="tab-project-data"
            >
              Project Data
              {searchType === 'project' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          </div>

          {/* Form Fields */}
          <div className="space-y-6">
             {/* Date Range */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="relative" ref={fromRef}>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Calendar className="inline w-4 h-4 mr-2" />
                  From
                </label>
                 <input
                   type="text"
                   inputMode="numeric"
                   placeholder="dd - mm - yyyy"
                   value={dateFromDisplay}
                   onChange={(e) => {
                     const v = e.target.value
                     setDateFromDisplay(v)
                     const iso = displayToIso(v)
                     if (iso) { setDateFrom(iso) }
                   }}
                   onBlur={() => {
                     if (dateFrom) setDateFromDisplay(isoToDisplay(dateFrom))
                   }}
                   onFocus={() => setShowFromCal(true)}
                   className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 placeholder:text-slate-500"
                   data-testid="input-date-from"
                 />
                 {showFromCal && (
                   <div className="absolute z-20 mt-2 w-full">
                     <InlineCalendar
                       value={dateFrom ? new Date(dateFrom) : null}
                       onChange={(d) => { const iso = dateToIsoLocal(d); setDateFrom(iso); setDateFromDisplay(isoToDisplay(iso)); setShowFromCal(false) }}
                       visibleMonth={fromMonth}
                       visibleYear={fromYear}
                       onMonthChange={setFromMonth}
                       onYearChange={setFromYear}
                     />
                   </div>
                 )}
              </div>
               <div className="relative" ref={toRef}>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Calendar className="inline w-4 h-4 mr-2" />
                  To
                </label>
                 <input
                   type="text"
                   inputMode="numeric"
                   placeholder="dd - mm - yyyy"
                   value={dateToDisplay}
                   onChange={(e) => {
                     const v = e.target.value
                     setDateToDisplay(v)
                     const iso = displayToIso(v)
                     if (iso) { setDateTo(iso) }
                   }}
                   onBlur={() => {
                     if (dateTo) setDateToDisplay(isoToDisplay(dateTo))
                   }}
                   onFocus={() => setShowToCal(true)}
                   className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 placeholder:text-slate-500"
                   data-testid="input-date-to"
                 />
                 {showToCal && (
                   <div className="absolute z-20 mt-2 w-full">
                     <InlineCalendar
                       value={dateTo ? new Date(dateTo) : null}
                       onChange={(d) => { const iso = dateToIsoLocal(d); setDateTo(iso); setDateToDisplay(isoToDisplay(iso)); setShowToCal(false) }}
                       visibleMonth={toMonth}
                       visibleYear={toYear}
                       onMonthChange={setToMonth}
                       onYearChange={setToYear}
                     />
                   </div>
                 )}
              </div>
            </div>

            {/* Quick Date Shortcuts */}
            <div className="flex gap-2">
              <button
                onClick={() => setQuickDate('today')}
                className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                data-testid="button-today"
              >
                Today
              </button>
              <button
                onClick={() => setQuickDate('week')}
                className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                data-testid="button-this-week"
              >
                This Week
              </button>
              <button
                onClick={() => setQuickDate('month')}
                className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                data-testid="button-this-month"
              >
                This Month
              </button>
            </div>

            {/* Time range inputs removed */}

            {/* Agent Selector - visible only for Agent Data */}
            {searchType === 'agent' && (
              <div className="relative" ref={agentRef}>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Users className="inline w-4 h-4 mr-2" />
                  Select Agents
                </label>
                <button
                  onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between hover:border-slate-400 transition-colors"
                  data-testid="button-agent-selector"
                >
                  <span className="text-slate-700">
                    {selectedAgents.length === 0
                      ? 'Choose agents...'
                      : `${selectedAgents.length} agent${selectedAgents.length > 1 ? 's' : ''} selected`}
                  </span>
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                </button>
                {showAgentDropdown && (
                  <div className="absolute z-10 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-slate-200">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          placeholder="Search agents..."
                          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          data-testid="input-agent-search"
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-60">
                      {loadingAgents ? (
                        <div className="p-4 text-sm text-slate-500 text-center">Loading agents...</div>
                      ) : filteredAgents.length === 0 ? (
                        <div className="p-4 text-sm text-slate-500 text-center">No agents found</div>
                      ) : (
                        filteredAgents.map((agent) => (
                          <label
                            key={agent.id}
                            className="flex items-center px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                            data-testid={`checkbox-agent-${agent.id}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedAgents.includes(agent.id)}
                              onChange={() => toggleAgent(agent.id)}
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                            />
                            <span className="ml-3 text-sm text-slate-700">{agent.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Project Selector - visible only for Project Data */}
            {searchType === 'project' && (
              <div className="relative" ref={projectRef}>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Briefcase className="inline w-4 h-4 mr-2" />
                  Select Projects
                </label>
                <button
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  className={`w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between transition-colors hover:border-slate-400`}
                  data-testid="button-project-selector"
                >
                  <span className="text-slate-700">
                    {selectedProjects.length === 0
                      ? 'Choose projects...'
                      : `${selectedProjects.length} project${selectedProjects.length > 1 ? 's' : ''} selected`}
                  </span>
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                </button>
                {showProjectDropdown && (
                  <div className="absolute z-10 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    <div className="sticky top-0 z-10 bg-white p-2 border-b border-slate-200 flex items-center gap-2 text-xs">
                      <span className="text-slate-600">Filter:</span>
                      <button className={`px-2 py-1 rounded ${projectFilter==='all'?'bg-slate-900 text-white':'hover:bg-slate-50'}`} onClick={()=>setProjectFilter('all')}>All</button>
                      <button className={`px-2 py-1 rounded ${projectFilter==='active'?'bg-emerald-600 text-white':'hover:bg-slate-50 text-emerald-700'}`} onClick={()=>setProjectFilter('active')}>Active</button>
                      <button className={`px-2 py-1 rounded ${projectFilter==='new'?'bg-blue-600 text-white':'hover:bg-slate-50 text-blue-700'}`} onClick={()=>setProjectFilter('new')}>New</button>
                      <button className={`px-2 py-1 rounded ${projectFilter==='archived'?'bg-slate-700 text-white':'hover:bg-slate-50 text-slate-700'}`} onClick={()=>setProjectFilter('archived')}>Archived</button>
                    </div>
                    {loadingProjects ? (
                      <div className="p-4 text-sm text-slate-500 text-center">Loading projects...</div>
                    ) : filteredProjects.length === 0 ? (
                      <div className="p-4 text-sm text-slate-500 text-center">No projects available</div>
                    ) : (
                      filteredProjects.map((project: any) => (
                        <label
                          key={project.id}
                          className="flex items-center px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                          data-testid={`checkbox-project-${project.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedProjects.includes(project.id)}
                            onChange={() => toggleProject(project.id)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          <span className="ml-3 text-sm text-slate-700 inline-flex items-center gap-2">
                            <span>{project.name}</span>
                            {project.status && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full border ${ project.status==='active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : project.status==='new' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200' }`}>
                                {project.status}
                              </span>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Search / Clear Buttons */}
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={clearFilters}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
              data-testid="button-clear-filters"
            >
              Clear
            </button>
            <button
              onClick={handleSearch}
            disabled={!isFormValid || submitting}
              className={`px-8 py-3 rounded-lg font-semibold transition-all ${
              isFormValid && !submitting
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              data-testid="button-search-statistics"
            >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                  aria-hidden
                />
                Searching…
              </span>
            ) : (
              'Search Statistics'
            )}
            </button>
          </div>
        </div>
      </div>
        </div>

        {/* Help Text */}
        <p className="text-center text-sm text-slate-500 mt-6">
          {searchType === 'agent' 
            ? 'Select at least one agent and a date range to view statistics'
            : 'Select at least one project and a date range to view statistics'}
        </p>
      </main>

      {/* Full-page overlay while navigating */}
      {submitting && (
        <div className="fixed inset-0 z-50 bg-white/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-3 text-slate-700">
            <span className="h-6 w-6 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
            <span className="text-sm font-medium">Loading results…</span>
          </div>
        </div>
      )}
    </div>
  )
}
