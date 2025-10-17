'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Users, Briefcase, ChevronDown, Search } from 'lucide-react'
import { format } from 'date-fns'
import { fetchAgents, fetchProjectsForAgents, type Agent, type Project } from '@/lib/api'

export default function SearchPage() {
  const router = useRouter()
  const [searchType, setSearchType] = useState<'agent' | 'project'>('agent')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [agentSearch, setAgentSearch] = useState('')
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)

  const isFormValid = dateFrom && dateTo && (
    (searchType === 'agent' && selectedAgents.length > 0) ||
    (searchType === 'project' && selectedProjects.length > 0)
  )

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    if (searchType === 'project') {
      loadAllProjects()
    } else if (selectedAgents.length > 0) {
      loadProjects()
    }
  }, [selectedAgents, searchType])

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

  const handleSearch = () => {
    if (!isFormValid) return
    
    const params = new URLSearchParams({
      type: searchType,
      dateFrom,
      dateTo,
      ...(timeFrom && { timeFrom }),
      ...(timeTo && { timeTo }),
      ...(selectedAgents.length > 0 && { agents: selectedAgents.join(',') }),
      ...(selectedProjects.length > 0 && { projects: selectedProjects.join(',') })
    })
    
    router.push(`/dashboard?${params.toString()}`)
  }

  const setQuickDate = (range: 'today' | 'week' | 'month') => {
    const today = new Date()
    const formatted = format(today, 'yyyy-MM-dd')
    
    switch (range) {
      case 'today':
        setDateFrom(formatted)
        setDateTo(formatted)
        break
      case 'week':
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay())
        setDateFrom(format(weekStart, 'yyyy-MM-dd'))
        setDateTo(formatted)
        break
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        setDateFrom(format(monthStart, 'yyyy-MM-dd'))
        setDateTo(formatted)
        break
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Agent & Campaign Statistics</h1>
          <div className="flex items-center gap-4">
            <button className="text-sm text-slate-600 hover:text-slate-900" data-testid="button-language-de">DE</button>
            <span className="text-slate-300">|</span>
            <button className="text-sm text-slate-600 hover:text-slate-900" data-testid="button-language-en">EN</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Search Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Calendar className="inline w-4 h-4 mr-2" />
                  From
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="input-date-from"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Calendar className="inline w-4 h-4 mr-2" />
                  To
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="input-date-to"
                />
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

            {/* Time Range (Optional) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Time From (optional)
                </label>
                <input
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="input-time-from"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Time To (optional)
                </label>
                <input
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="input-time-to"
                />
              </div>
            </div>

            {/* Agent Selector */}
            <div className="relative">
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

            {/* Project Selector (Optional) */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Briefcase className="inline w-4 h-4 mr-2" />
                Select Projects (optional)
              </label>
              <button
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                disabled={searchType === 'agent' && selectedAgents.length === 0}
                className={`w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between transition-colors ${
                  (searchType === 'agent' && selectedAgents.length === 0)
                    ? 'bg-slate-50 cursor-not-allowed'
                    : 'hover:border-slate-400'
                }`}
                data-testid="button-project-selector"
              >
                <span className="text-slate-700">
                  {selectedProjects.length === 0
                    ? 'All projects'
                    : `${selectedProjects.length} project${selectedProjects.length > 1 ? 's' : ''} selected`}
                </span>
                <ChevronDown className="w-5 h-5 text-slate-400" />
              </button>
              {showProjectDropdown && (
                <div className="absolute z-10 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {loadingProjects ? (
                    <div className="p-4 text-sm text-slate-500 text-center">Loading projects...</div>
                  ) : projects.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500 text-center">No projects available</div>
                  ) : (
                    projects.map((project) => (
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
                        <span className="ml-3 text-sm text-slate-700">{project.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Search Button */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSearch}
              disabled={!isFormValid}
              className={`px-8 py-3 rounded-lg font-semibold transition-all ${
                isFormValid
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              data-testid="button-search-statistics"
            >
              Search Statistics
            </button>
          </div>
        </div>

        {/* Help Text */}
        <p className="text-center text-sm text-slate-500 mt-6">
          {searchType === 'agent' 
            ? 'Select at least one agent and a date range to view statistics'
            : 'Select at least one project and a date range to view statistics'}
        </p>
      </main>
    </div>
  )
}
