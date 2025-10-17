import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import FilterSidebar from "@/components/filter-sidebar";
import AgentStatisticsTable from "@/components/agent-statistics-table";
import ProjectDataTable from "@/components/project-data-table";
import { SettingsDialog } from "@/components/settings-dialog";
import { AppFooter } from "@/components/app-footer";
import { DatabaseWarning } from "@/components/database-warning";
import { DialfireWarning } from "@/components/dialfire-warning";
import { UnifiedCallNotification } from "@/components/unified-call-notification";
import AgentSelectionPopup from "@/components/agent-selection-popup";
import { LanguageSwitcher } from "@/components/language-switcher";
import { categorizeOutcome, CallNotification } from "@shared/schema";
import { type StatisticsFilter, type Agent, type Project, type ProjectTargets } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, ChevronDown, Check, FoldVertical, ArrowUpDown, Calendar, User, Target, TestTube, Search, ChevronsRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [filters, setFilters] = useState<StatisticsFilter>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [callDetailsRefreshKey, setCallDetailsRefreshKey] = useState(0);
  const [isAutoSelectingProjects, setIsAutoSelectingProjects] = useState(false);
  const [hasSearchedForProjects, setHasSearchedForProjects] = useState(false);
  const [lastSearchWasSuccessful, setLastSearchWasSuccessful] = useState(false);
  const [lastSearchParams, setLastSearchParams] = useState<StatisticsFilter | null>(null);
  const isProgrammaticRefreshRef = useRef(false);
  const [searchToken, setSearchToken] = useState(0);
  const [headerAgentPopupOpen, setHeaderAgentPopupOpen] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [expandedOutcomes, setExpandedOutcomes] = useState<Set<string>>(new Set());
  const [expandedCallDetails, setExpandedCallDetails] = useState<Set<string>>(new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [expandedProjectCallDetails, setExpandedProjectCallDetails] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedIndividualProjects, setExpandedIndividualProjects] = useState<Set<string>>(new Set());
  const [showDetailColumns, setShowDetailColumns] = useState(false);
  const [collapseAllToggle, setCollapseAllToggle] = useState(false);
  const [activeTab, setActiveTab] = useState<'agentendaten' | 'projektdaten'>('agentendaten');
  const [projektDateFrom, setProjektDateFrom] = useState('');
  const [projektDateTo, setProjektDateTo] = useState('');

  // Local state for agent dates (from FilterSidebar) before search is performed  
  const [agentDateFrom, setAgentDateFrom] = useState('');
  const [agentDateTo, setAgentDateTo] = useState('');
  
  // Initialize header dates only on popup open transition (not on filter changes)
  const wasHeaderPopupOpen = useRef(false);
  useEffect(() => {
    if (headerAgentPopupOpen && !wasHeaderPopupOpen.current) {
      // Only initialize when transitioning from closed to open
      // Use existing agentDateFrom/agentDateTo if they exist, otherwise fall back to filters
      if (!agentDateFrom && !agentDateTo) {
        setAgentDateFrom(filters.dateFrom || '');
        setAgentDateTo(filters.dateTo || '');
      }
    }
    wasHeaderPopupOpen.current = headerAgentPopupOpen;
  }, [headerAgentPopupOpen, agentDateFrom, agentDateTo]);
  const [agentSortBy, setAgentSortBy] = useState<'name-asc' | 'name-desc' | 'positive-desc' | 'negative-desc'>('name-asc');
  const [showDbWarning, setShowDbWarning] = useState(false);
  const [showDialfireWarning, setShowDialfireWarning] = useState(false);
  const [wasEverConnected, setWasEverConnected] = useState(false);
  const [dbTimeoutId, setDbTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [dialfireTimeoutId, setDialfireTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [previousCallCount, setPreviousCallCount] = useState<number>(0);

  // Call notification queue and states
  const [notificationQueue, setNotificationQueue] = useState<CallNotification[]>([]);
  const [activeNotification, setActiveNotification] = useState<CallNotification | null>(null);
  const previousOutcomeCountsRef = useRef<Map<string, number>>(new Map());
  const initializedKeysRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);

  // Handle notification queue - show notifications one by one
  useEffect(() => {
    if (!activeNotification && notificationQueue.length > 0) {
      const nextNotification = notificationQueue[0];
      setActiveNotification(nextNotification);
      setNotificationQueue(prev => prev.slice(1));
    }
  }, [activeNotification, notificationQueue]);

  // Clear notification queue when filters change (to avoid stale notifications)
  useEffect(() => {
    // Skip filter-change side effects during programmatic refresh
    if (isProgrammaticRefreshRef.current) {
      isProgrammaticRefreshRef.current = false;
      return;
    }
    
    setNotificationQueue([]);
    setActiveNotification(null);
    // Clear tracking refs to re-initialize counts for new filter
    previousOutcomeCountsRef.current.clear();
    initializedKeysRef.current.clear();
    // Mark as initial load after filter change
    isInitialLoadRef.current = true;
    // Reset search state when filters change
    setHasSearchedForProjects(false);
    // Re-enable search button when filters change
    setLastSearchWasSuccessful(false);
    // Reset search token when filters change to prevent auto-loading
    setSearchToken(0);
    // Cancel any ongoing statistics queries to prevent auto-refetch after filter change
    queryClient.cancelQueries({ queryKey: ["/api/statistics", "manual-trigger"] });
  }, [filters, queryClient]);


  const { data: agents = [], isLoading: agentsLoading, error: agentsError } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: projects = [], isLoading: projectsLoading, error: projectsError } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Monitor Dialfire API status
  const { data: dialfireStatusData, error: dialfireStatusError } = useQuery<{ connected: boolean; timestamp: string }>({
    queryKey: ["/api/dialfire-status"],
    refetchInterval: 60000, // Check every minute
    retry: 1,
  });

  // Centralized project targets to prevent duplicate API calls
  const { data: projectTargets = [], isLoading: targetsLoading } = useQuery<ProjectTargets[]>({
    queryKey: ['/api/project-targets'],
    staleTime: 0,
    gcTime: 0,
  });

  // Monitor database connection status for warning
  useEffect(() => {
    if (agents.length > 0 || projects.length > 0) {
      setWasEverConnected(true);
    }
    
    if (wasEverConnected && (agentsError || projectsError)) {
      // Clear any existing timeout
      if (dbTimeoutId) {
        clearTimeout(dbTimeoutId);
      }
      
      // Set a 5-second delay before showing the warning
      const timeoutId = setTimeout(() => {
        setShowDbWarning(true);
        setDbTimeoutId(null);
      }, 5000);
      
      setDbTimeoutId(timeoutId);
    } else if (!agentsError && !projectsError) {
      // Connection restored - clear timeout and hide warning
      if (dbTimeoutId) {
        clearTimeout(dbTimeoutId);
        setDbTimeoutId(null);
      }
      setShowDbWarning(false);
    }
  }, [agents, projects, agentsError, projectsError, wasEverConnected, dbTimeoutId]);

  // Monitor Dialfire API connection status for warning
  useEffect(() => {    
    if (dialfireStatusError || (dialfireStatusData && !dialfireStatusData.connected)) {
      // Clear any existing timeout
      if (dialfireTimeoutId) {
        clearTimeout(dialfireTimeoutId);
      }
      
      // Set a 5-second delay before showing the warning
      const timeoutId = setTimeout(() => {
        setShowDialfireWarning(true);
        setDialfireTimeoutId(null);
      }, 5000);
      
      setDialfireTimeoutId(timeoutId);
    } else if (!dialfireStatusError && dialfireStatusData && dialfireStatusData.connected) {
      // Connection restored - clear timeout and hide warning
      if (dialfireTimeoutId) {
        clearTimeout(dialfireTimeoutId);
        setDialfireTimeoutId(null);
      }
      setShowDialfireWarning(false);
    }
  }, [dialfireStatusData, dialfireStatusError, dialfireTimeoutId]);

  // Removed auto-selection - let user choose agents and dates manually

  // Removed auto-selection for projects - let user choose manually

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (dbTimeoutId) {
        clearTimeout(dbTimeoutId);
      }
      if (dialfireTimeoutId) {
        clearTimeout(dialfireTimeoutId);
      }
    };
  }, [dbTimeoutId, dialfireTimeoutId]);

  // Removed unfiltered statistics call that was interfering with dynamic categories
  const allStatistics: never[] = [];

  // Check if we have valid filter state for statistics loading
  const isValidFilterState = !!(filters.agentIds && filters.agentIds.length > 0 && (filters.dateFrom || filters.dateTo) && filters.projectIds && filters.projectIds.length > 0);

  // Extended loading state that includes preloading of key call details
  const [isPreloadingCallDetails, setIsPreloadingCallDetails] = useState(false);
  const [preloadedCallDetails, setPreloadedCallDetails] = useState<Set<string>>(new Set());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Track when filters have changed and prevent auto-refetch until user clicks search
  const [filtersDirty, setFiltersDirty] = useState(false);
  
  // Track if we have ever successfully searched (never resets, unlike lastSearchWasSuccessful)
  const [hasEverSearchedSuccessfully, setHasEverSearchedSuccessfully] = useState(false);
  
  // Separate state for displayed statistics - keeps showing old data until new data is loaded
  const [displayedStatistics, setDisplayedStatistics] = useState<any[]>([]);
  
  // Calculate whether auto-refresh should be active
  const canAutoRefresh = searchToken > 0 && isValidFilterState && !filtersDirty;
  
  // Use more frequent refresh interval when filters are active (10 seconds instead of 30)
  const refetchIntervalMs = canAutoRefresh ? 10000 : 0; // Disable interval when filters are dirty

  const { data: rawStatistics = [], isLoading: statisticsLoading, refetch } = useQuery({
    queryKey: ["/api/statistics", "manual-trigger", searchToken, filters], // Include searchToken and filters to ensure fresh queries
    enabled: searchToken > 0 && isValidFilterState, // Only enable when user clicks search and filters are valid
    refetchInterval: canAutoRefresh ? 10000 : false, // Auto-refresh every 10s when filters are clean
    refetchOnWindowFocus: false, // Disable automatic refetch on window focus
    refetchOnReconnect: false, // Disable automatic refetch on reconnect
    refetchOnMount: false, // Disable automatic refetch on mount
    queryFn: async ({ signal }) => {
      // Build the appropriate filter based on active tab
      // Only query projects that have actual call data
      if (!filters.projectIds || filters.projectIds.length === 0) {
        console.log('🚀 FRONTEND: No projects with calls found, returning empty result');
        return [];
      }
      
      let queryFilter = { ...filters };
      
      if (activeTab === 'projektdaten') {
        // For projekt tab, use separate projekt dates and clear agent-specific filters
        queryFilter = {
          ...filters,
          dateFrom: projektDateFrom || undefined,
          dateTo: projektDateTo || undefined,
        };
      }
      
      console.log(`🚀 FRONTEND: FILTERED Statistics API called with filters:`, JSON.stringify(queryFilter));
      console.log(`🚀 FRONTEND: TIME FILTERS CHECK:`, JSON.stringify({
        'filters.timeFrom': filters.timeFrom,
        'filters.timeTo': filters.timeTo,
        'queryFilter.timeFrom': queryFilter.timeFrom,
        'queryFilter.timeTo': queryFilter.timeTo
      }));
      const response = await fetch("/api/statistics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...queryFilter,
          // Removed _cacheBust to allow proper caching
        }),
        signal, // Add AbortController signal to cancel old requests
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch statistics");
      }
      const result = await response.json();
      console.log(`🚀 FRONTEND: FILTERED Statistics received: ${result.length} statistics`);
      if (result.length > 0 && result[0].outcomes) {
        console.log(`🚀 FRONTEND: First statistic outcomes:`, JSON.stringify(result[0].outcomes, null, 2));
      }
      
      // Track updates when new data arrives
      setLastUpdateTime(new Date());
      
      // Calculate total calls and check if count changed
      const totalCalls = result.reduce((sum: number, stat: any) => sum + (stat.anzahl || 0), 0);
      if (previousCallCount > 0 && totalCalls !== previousCallCount) {
        console.log(`📊 Call count changed: ${previousCallCount} → ${totalCalls}`);
        // Auto-refresh call details when statistics update
        setCallDetailsRefreshKey(prev => prev + 1);
      }
      setPreviousCallCount(totalCalls);
      
      // Check for new outcome calls (only when today is included in the date range)
      const today = new Date().toISOString().split('T')[0];
      const isTodayIncluded = !filters.dateTo || filters.dateTo >= today;
      
      console.log(`🔍 Notification check: today=${today}, isTodayIncluded=${isTodayIncluded}, resultLength=${result.length}, isInitialLoad=${isInitialLoadRef.current}`);
      
      if (isTodayIncluded && result.length > 0) {
        const newNotifications: CallNotification[] = [];
        
        // Skip all notifications on initial load after filter change
        if (isInitialLoadRef.current) {
          console.log(`🔇 Skipping notifications on initial load after filter change`);
          
          // Initialize all keys without notifications
          result.forEach((stat: any) => {
            if (stat.agentId && stat.outcomes) {
              Object.entries(stat.outcomes).forEach(([outcome, count]: [string, any]) => {
                const outcomeCount = count || 0;
                const key = `${stat.agentId}:${stat.projectId}:${outcome}`;
                previousOutcomeCountsRef.current.set(key, outcomeCount);
                initializedKeysRef.current.add(key);
              });
            }
          });
          
          // Mark as no longer initial load
          isInitialLoadRef.current = false;
        } else {
          // Normal processing for subsequent loads
          result.forEach((stat: any) => {
            if (stat.agentId && stat.outcomes) {
              // Get agent and project info
              const agent = agents.find(a => a.id === stat.agentId);
              const project = projects.find(p => p.id === stat.projectId);
              
              if (!agent || !project) return;
              
              // Only process notifications for statistics from today
              const statDate = new Date(stat.date).toISOString().split('T')[0];
              if (statDate !== today) {
                console.log(`⏸️ Skipping notifications for ${agent.name} - stat from ${statDate}, not today (${today})`);
                return; // Skip notifications for historical data
              }
              
              // Check each outcome for changes
              Object.entries(stat.outcomes).forEach(([outcome, count]: [string, any]) => {
                const outcomeCount = count || 0;
                const key = `${stat.agentId}:${stat.projectId}:${outcome}`;
                
                // Skip if we haven't initialized this key yet
                if (!initializedKeysRef.current.has(key)) {
                  previousOutcomeCountsRef.current.set(key, outcomeCount);
                  initializedKeysRef.current.add(key);
                  return; // Don't notify on first load
                }
              
              const previousCount = previousOutcomeCountsRef.current.get(key) || 0;
              
              // Check if outcome count increased
              if (outcomeCount > previousCount) {
                const delta = outcomeCount - previousCount;
                const category = categorizeOutcome(outcome);
                
                console.log(`🎉 New ${outcome} detected for ${agent.name}: ${previousCount} → ${outcomeCount} (delta: ${delta})`);
                
                // Generate current time
                const currentTime = new Date().toLocaleTimeString('de-DE', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                });
                
                // Generate date range text
                let dateRangeText = "";
                if (filters.dateFrom === today && (!filters.dateTo || filters.dateTo === today)) {
                  dateRangeText = "";
                } else if (filters.dateFrom && filters.dateTo) {
                  if (filters.dateFrom === filters.dateTo) {
                    dateRangeText = `am ${new Date(filters.dateFrom).toLocaleDateString('de-DE')}`;
                  } else {
                    dateRangeText = `im Zeitraum ${new Date(filters.dateFrom).toLocaleDateString('de-DE')} - ${new Date(filters.dateTo).toLocaleDateString('de-DE')}`;
                  }
                } else if (filters.dateFrom) {
                  dateRangeText = `seit ${new Date(filters.dateFrom).toLocaleDateString('de-DE')}`;
                }
                
                newNotifications.push({
                  agentName: agent.name,
                  projectName: project.name,
                  outcome,
                  category,
                  count: outcomeCount,
                  delta,
                  time: currentTime,
                  dateRange: dateRangeText,
                });
              }
                
                // Update the stored count
                previousOutcomeCountsRef.current.set(key, outcomeCount);
              });
            }
          });
        }
        
        // Add new notifications to queue
        if (newNotifications.length > 0) {
          setNotificationQueue(prev => [...prev, ...newNotifications]);
        }
      }
      
      return result;
    },
    refetchIntervalInBackground: false, // Don't continue refreshing when window is not focused
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
  
  // Update displayed statistics only when new data is successfully loaded AND filters are not dirty
  useEffect(() => {
    if (rawStatistics && rawStatistics.length > 0 && !statisticsLoading && !filtersDirty) {
      setDisplayedStatistics(rawStatistics);
    } else if (rawStatistics && rawStatistics.length === 0 && !statisticsLoading && !filtersDirty) {
      setDisplayedStatistics([]);
    }
  }, [rawStatistics, statisticsLoading, filtersDirty]);

  // Handle successful statistics loading - mark as successful and save params
  useEffect(() => {
    if (!statisticsLoading && searchToken > 0 && rawStatistics !== undefined) {
      // Mark as successful only on actual query success
      setLastSearchWasSuccessful(true);
      // Mark that we have ever searched successfully (never resets)
      setHasEverSearchedSuccessfully(true);
      // Save search parameters after successful completion
      setLastSearchParams({ ...filters });
    }
  }, [statisticsLoading, searchToken, rawStatistics, filters]);

  // Handle preloading on successful initial load
  useEffect(() => {
    if (!hasLoadedOnce && rawStatistics && Array.isArray(rawStatistics) && rawStatistics.length > 0 && !statisticsLoading) {
      setTimeout(async () => {
        setIsPreloadingCallDetails(true);
        await preloadKeyCallDetails(rawStatistics);
        setIsPreloadingCallDetails(false);
        setHasLoadedOnce(true);
      }, 0);
    }
  }, [rawStatistics, statisticsLoading, hasLoadedOnce]);
  
  


  // Preload key call details for main outcomes
  const preloadKeyCallDetails = async (statisticsData: any[]) => {
    if (!statisticsData || statisticsData.length === 0) return;
    
    setIsPreloadingCallDetails(true);
    const newPreloaded = new Set<string>();
    
    try {
      // Get key outcomes that are likely to be expanded by users
      const keyDetails = statisticsData.flatMap((stat: any) => {
        const agentId = stat.agentId;
        const projectId = stat.projectId;
        
        // Preload the main outcome categories that users typically expand
        const keyOutcomes = ['Termin', 'KI_Gatekeeper', 'falsche_Zielgruppe', 'KI_Ansprechpartner'];
        
        return keyOutcomes
          .filter(outcome => stat.outcomes && stat.outcomes[outcome] > 0)
          .map(outcome => `${agentId}-${projectId}-${outcome}`);
      });
      
      // Limit to the most important ones to avoid overloading
      const priorityDetails = keyDetails.slice(0, 6);
      
      // Preload these call details
      const promises = priorityDetails.map(async (key) => {
        const [agentId, projectId, outcome] = key.split('-');
        try {
          const response = await fetch(`/api/call-details/${agentId}/${projectId}?outcome=${outcome}&${filters.timeFrom ? `timeFrom=${filters.timeFrom}` : ''}&${filters.timeTo ? `timeTo=${filters.timeTo}` : ''}`);
          if (response.ok) {
            newPreloaded.add(key);
          }
        } catch (error) {
          console.log(`⚠️ Failed to preload call details for ${key}:`, error);
        }
      });
      
      await Promise.allSettled(promises);
      setPreloadedCallDetails(newPreloaded);
    } catch (error) {
      console.log(`⚠️ Error during call details preloading:`, error);
    } finally {
      // Add a small delay to ensure smooth UX transition
      setTimeout(() => setIsPreloadingCallDetails(false), 500);
    }
  };

  // Combined loading state: true if either initial statistics loading OR preloading call details (but only on first load)
  const isFullyLoading = statisticsLoading || (!hasLoadedOnce && isPreloadingCallDetails);

  const handleFilterChange = (newFilters: StatisticsFilter) => {
    const oldTimeFilters = { timeFrom: filters.timeFrom, timeTo: filters.timeTo };
    const newTimeFilters = { timeFrom: newFilters.timeFrom, timeTo: newFilters.timeTo };
    
    // Reset hasLoadedOnce when filters change to show loading on new data
    setHasLoadedOnce(false);
    
    // Mark filters as dirty to prevent auto-refetch
    setFiltersDirty(true);
    
    setFilters(newFilters);
    setRefreshKey(prev => prev + 1);
    
    // DISABLED: Force cache invalidation if time filters changed
    // This was causing automatic statistics loading when user changes time filters
    // User must now explicitly click "Statistiken suchen" to load statistics
    if (oldTimeFilters.timeFrom !== newTimeFilters.timeFrom || oldTimeFilters.timeTo !== newTimeFilters.timeTo) {
      console.log(`🔄 Time filters changed from ${oldTimeFilters.timeFrom}-${oldTimeFilters.timeTo} to ${newTimeFilters.timeFrom}-${newTimeFilters.timeTo} - waiting for manual search`);
      // refetch(); // DISABLED - no automatic refetch
    }
  };

  const handleTabChange = (tab: 'agentendaten' | 'projektdaten') => {
    setActiveTab(tab);
    // Clear refresh to force new data load if needed
    if (tab === 'projektdaten') {
      // We could implement special projekt-specific logic here
    }
  };

  const handleProjektDatesChange = (dateFrom: string, dateTo: string) => {
    setProjektDateFrom(dateFrom);
    setProjektDateTo(dateTo);
    
    // DON'T update the main filters - keep projekt dates separate
    // We'll handle this in the query logic instead
    setRefreshKey(prev => prev + 1);
  };

  // Handle local agent date changes from FilterSidebar (before search is performed)
  // Only sync if header popup is NOT open to prevent overwriting user input
  const handleAgentLocalDatesChange = (dateFrom: string, dateTo: string) => {
    if (!headerAgentPopupOpen) {
      setAgentDateFrom(dateFrom);
      setAgentDateTo(dateTo);
    }
  };

  const handleRefresh = async () => {
    // Use lastSearchParams if available, otherwise use current filters if valid
    const paramsToUse = lastSearchParams ?? (isValidFilterState ? filters : null);
    
    if (!paramsToUse) {
      // TODO: Show toast message to user
      return;
    }
    
    // Only set programmatic flag if we will actually change filters
    const willChangeFilters = JSON.stringify(paramsToUse) !== JSON.stringify(filters);
    if (willChangeFilters) {
      // Mark as programmatic refresh to prevent searchToken reset
      isProgrammaticRefreshRef.current = true;
      setFilters(paramsToUse);
    } else {
      // Ensure flag is false if no filter change
      isProgrammaticRefreshRef.current = false;
    }
    
    // Ensure query is enabled by clearing filtersDirty
    setFiltersDirty(false);
    
    // Re-enable search button and trigger new search
    setLastSearchWasSuccessful(false);
    setSearchToken(prev => prev + 1);
    
    // Also refresh call details
    setCallDetailsRefreshKey(prev => prev + 1);
    await queryClient.invalidateQueries({ queryKey: ["/api/call-details"] });
  };

  const handleSelectSpecificAgent = () => {
    // Find Ihsan.Simseker agent
    const ihsanAgent = agents.find(agent => agent.name === 'Ihsan.Simseker');
    if (!ihsanAgent) {
      // Fallback to selecting all agents if Ihsan not found
      handleSelectAllAgents();
      return;
    }
    
    const ihsanAgentId = ihsanAgent.id;
    
    // Find the specific project 3F767KEPW4V73JZS
    const specificProject = projects.find(project => project.name === '3F767KEPW4V73JZS');
    const projectIds = specificProject ? [specificProject.id] : undefined;
    
    setFilters({ 
      ...filters, 
      agentIds: [ihsanAgentId],
      projectIds: projectIds,
      dateFrom: '2025-08-01',
      dateTo: '2025-09-05'
    });
    setRefreshKey(prev => prev + 1);
  };

  const handleSelectAllAgents = () => {
    const currentlySelectedAgents = filters.agentIds || [];
    
    if (currentlySelectedAgents.length === agents.length) {
      // Deselect all - only change agentIds, keep projectIds unchanged
      setFilters({ ...filters, agentIds: undefined });
    } else {
      // Select all - only change agentIds, keep projectIds unchanged  
      const allAgentIds = agents.map(agent => agent.id);
      setFilters({ 
        ...filters, 
        agentIds: allAgentIds
        // projectIds stays unchanged
      });
    }
    setRefreshKey(prev => prev + 1);
  };

  const handleHeaderAgentToggle = (agentId: string, checked: boolean) => {
    const currentAgents = filters.agentIds || [];
    const newSelectedAgents = checked 
      ? [...currentAgents, agentId]
      : currentAgents.filter(id => id !== agentId);
    
    // SIMPLE: Only change agentIds, keep existing projectIds unchanged
    // This prevents the "Statistiken suchen" message from appearing
    setFilters({
      ...filters,
      agentIds: newSelectedAgents.length > 0 ? newSelectedAgents : undefined
      // projectIds stays unchanged
    });
    setRefreshKey(prev => prev + 1);
  };

  // Header popup date handlers
  const handleHeaderDateFromChange = (dateFrom: string) => {
    setAgentDateFrom(dateFrom);
  };

  const handleHeaderDateToChange = (dateTo: string) => {
    setAgentDateTo(dateTo);
    // If dateTo is smaller than dateFrom, adjust dateFrom to match dateTo
    if (agentDateFrom && dateTo && dateTo < agentDateFrom) {
      setAgentDateFrom(dateTo);
    }
  };

  // FilterSidebar search function reference
  const onLoadStatisticsRef = useRef<() => void>();

  // Create the search function that will be used by FilterSidebar
  const handleLoadStatistics = () => {
    setFiltersDirty(false); // Clear dirty flag when user manually searches
    setLastSearchWasSuccessful(false); // Reset button state before search
    setSearchToken(prev => prev + 1);
    // Reset all expansion states when new statistics are loaded
    setExpandedAgents(new Set());
    setExpandedOutcomes(new Set());
    setExpandedCallDetails(new Set());
    setExpandedGroupIds(new Set());
    setExpandedProjectCallDetails(new Set());
    setExpandedProjects(new Set());
  };

  // Store the reference for use in popup
  onLoadStatisticsRef.current = handleLoadStatistics;

  // Header popup search function - triggers the main FilterSidebar search
  const handleHeaderSearch = () => {
    console.log('🔍 Popup search - finding FilterSidebar button...');
    
    // Get today's date in YYYY-MM-DD format (local timezone)
    const today = new Date().toLocaleDateString('sv-SE');
    
    // Validate and adjust dates if necessary
    let finalDateFrom = agentDateFrom;
    let finalDateTo = agentDateTo;
    
    // If dateFrom is in the future, set it to today and clear dateTo
    if (finalDateFrom && finalDateFrom > today) {
      finalDateFrom = today;
      finalDateTo = '';
      setAgentDateFrom(today); // Update state to reflect the adjustment
      setAgentDateTo(''); // Clear the dateTo field
    }
    // If dateTo is greater than today, adjust it to today
    else if (finalDateTo && finalDateTo > today) {
      finalDateTo = today;
      setAgentDateTo(today); // Update state to reflect the adjustment
    }
    
    // Update filters with date values AND agent selection, then trigger search
    const updatedFilters = {
      ...filters,
      dateFrom: finalDateFrom || undefined,
      dateTo: finalDateTo || undefined,
      agentIds: filters.agentIds || undefined,  // Keep current agent selection
    };
    
    // Prevent searchToken reset by filters useEffect
    isProgrammaticRefreshRef.current = true;
    setFilters(updatedFilters);
    
    // Find and click the real "Statistiken suchen" button in FilterSidebar
    setTimeout(() => {
      const searchButton = document.querySelector('[data-testid="button-los"]') as HTMLButtonElement;
      if (searchButton) {
        console.log('✅ Found FilterSidebar search button, clicking...');
        searchButton.click();
      } else {
        console.error('❌ Could not find FilterSidebar search button');
        // Fallback: use the ref approach
        if (onLoadStatisticsRef.current) {
          onLoadStatisticsRef.current();
        }
      }
    }, 100); // Small delay to ensure filters are updated
  };

  const handleSelectAllProjects = () => {
    const allProjectIds = projects.map(project => project.id);
    setFilters({ 
      ...filters, 
      projectIds: allProjectIds
    });
    setRefreshKey(prev => prev + 1);
  };

  const isAllAgentsSelected = () => {
    const currentlySelectedAgents = filters.agentIds || [];
    return currentlySelectedAgents.length === agents.length && agents.length > 0;
  };

  const handleCollapseAll = () => {
    // Collapse all expanded sections including outcomes
    setExpandedAgents(new Set());
    setExpandedOutcomes(new Set()); // Also collapse outcome states
    setExpandedCallDetails(new Set());
    setExpandedProjects(new Set()); // Also collapse project states
    setExpandedProjectCallDetails(new Set()); // Also collapse project call details
    setExpandedIndividualProjects(new Set()); // Also collapse individual project states
    setShowDetailColumns(false); // Also collapse detail columns
    
    // Set toggle to true momentarily, then back to false
    setCollapseAllToggle(true);
    setTimeout(() => {
      setCollapseAllToggle(false);
    }, 100);
  };

  const getAgentSelectionDisplay = () => {
    const currentlySelectedAgents = filters.agentIds || [];
    
    if (currentlySelectedAgents.length === 0) {
      return t('filter.noAgentsSelected');
    }
    if (currentlySelectedAgents.length === agents.length && agents.length > 0) {
      return t('filter.selectAll');
    }
    return t('header.agentSelected', { count: currentlySelectedAgents.length });
  };

  const getDropdownAgentDisplay = () => {
    if (agentsLoading) {
      return t('common.loading');
    }
    if (!filters.agentIds) {
      return t('filter.selectAgents');
    }
    const currentlySelectedAgents = filters.agentIds;
    
    if (currentlySelectedAgents.length === 0) {
      return t('filter.selectAgents');
    }
    return t('header.agentSelected', { count: currentlySelectedAgents.length });
  };

  // Calculate week number using the same logic as FilterSidebar
  const getWeekNumber = (date: Date) => {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  };

  // Enhanced function to check if date range is a calendar week (Monday-Sunday or Monday-Friday)
  const getSelectedWeekInfo = (dateFrom?: string, dateTo?: string) => {
    const from = dateFrom || filters.dateFrom;
    const to = dateTo || filters.dateTo;
    
    if (!from || !to) return null;
    
    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    const diffTime = toDate.getTime() - fromDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const fromDay = fromDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const toDay = toDate.getDay();
    
    // Check for Monday-Sunday (full week)
    if (diffDays === 6 && fromDay === 1 && toDay === 0) {
      return getWeekNumber(fromDate);
    }
    
    // Check for Monday-Friday (work week)
    if (diffDays === 4 && fromDay === 1 && toDay === 5) {
      return getWeekNumber(fromDate);
    }
    
    // Check for Monday-Saturday (work week with Saturday)
    if (diffDays === 5 && fromDay === 1 && toDay === 6) {
      return getWeekNumber(fromDate);
    }
    
    return null;
  };

  // Check if the selected date range is exactly one full month
  const getSelectedMonthInfo = () => {
    if (!filters.dateFrom || !filters.dateTo) return null;
    
    const fromDate = new Date(filters.dateFrom);
    const toDate = new Date(filters.dateTo);
    
    // Check if it starts on the 1st of a month
    if (fromDate.getDate() !== 1) return null;
    
    // Check if it ends on the last day of the same month
    const lastDayOfMonth = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0);
    
    if (toDate.getDate() === lastDayOfMonth.getDate() && 
        toDate.getMonth() === fromDate.getMonth() && 
        toDate.getFullYear() === fromDate.getFullYear()) {
      
      const monthNames = [
        'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
      ];
      
      return `${monthNames[fromDate.getMonth()]} ${fromDate.getFullYear()}`;
    }
    
    return null;
  };

  const selectedWeek = getSelectedWeekInfo();
  const selectedMonth = getSelectedMonthInfo();
  
  // Check if projekt dates form a week
  const projektSelectedWeek = getSelectedWeekInfo(projektDateFrom, projektDateTo);

  // Format the header display
  const getHeaderDisplay = () => {
    // Check which tab is active and use appropriate dates
    if (activeTab === 'projektdaten') {
      // Use projekt-specific dates for Projektdaten tab
      if (projektSelectedWeek) {
        // Show week number with date range
        const fromDate = new Date(projektDateFrom!);
        const toDate = new Date(projektDateTo!);
        
        // Check if same year
        const sameYear = fromDate.getFullYear() === toDate.getFullYear();
        
        const fromFormatted = fromDate.toLocaleDateString('de-DE', { 
          day: '2-digit', 
          month: '2-digit', 
          year: sameYear ? undefined : 'numeric' 
        });
        const toFormatted = toDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        // If same date, show only one date
        if (projektDateFrom === projektDateTo) {
          return `KW${projektSelectedWeek} | ${toFormatted}`;
        } else {
          return `KW${projektSelectedWeek} | ${fromFormatted} - ${toFormatted}`;
        }
      } else if (projektDateFrom && projektDateTo) {
        const fromDate = new Date(projektDateFrom);
        const toDate = new Date(projektDateTo);
        
        // If same date, show only one date
        if (projektDateFrom === projektDateTo) {
          const fromFormatted = fromDate.toLocaleDateString('de-DE', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
          });
          return fromFormatted;
        } else {
          // Check if same year
          const sameYear = fromDate.getFullYear() === toDate.getFullYear();
          
          const fromFormatted = fromDate.toLocaleDateString('de-DE', { 
            day: '2-digit', 
            month: '2-digit', 
            year: sameYear ? undefined : 'numeric' 
          });
          const toFormatted = toDate.toLocaleDateString('de-DE', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
          });
          
          return `${fromFormatted} - ${toFormatted}`;
        }
      } else if (projektDateFrom) {
        const fromFormatted = new Date(projektDateFrom).toLocaleDateString('de-DE', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
        return fromFormatted;
      } else if (projektDateTo) {
        const toFormatted = new Date(projektDateTo).toLocaleDateString('de-DE', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
        return `Bis ${toFormatted}`;
      }
      return 'Projektdaten';
    }
    
    // Agentendaten tab - use existing logic
    if (selectedWeek) {
      // Show week without space and date range
      const fromDate = new Date(filters.dateFrom!);
      const toDate = new Date(filters.dateTo!);
      
      // Check if same year
      const sameYear = fromDate.getFullYear() === toDate.getFullYear();
      
      const fromFormatted = fromDate.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: sameYear ? undefined : 'numeric' 
      });
      const toFormatted = toDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      
      // If same date, show only one date
      if (filters.dateFrom === filters.dateTo) {
        return `KW${selectedWeek} | ${toFormatted}`;
      } else {
        return `KW${selectedWeek} | ${fromFormatted} - ${toFormatted}`;
      }
    }
    
    if (selectedMonth) {
      // Show date range instead of month name
      const fromDate = new Date(filters.dateFrom!);
      const toDate = new Date(filters.dateTo!);
      const sameYear = fromDate.getFullYear() === toDate.getFullYear();
      
      const fromFormatted = fromDate.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: sameYear ? undefined : 'numeric' 
      });
      const toFormatted = toDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      
      // If same date, show only one date
      if (filters.dateFrom === filters.dateTo) {
        return toFormatted;
      } else {
        return `${fromFormatted} - ${toFormatted}`;
      }
    }
    
    if (filters.dateFrom || filters.dateTo) {
      // Show custom date range
      if (filters.dateFrom && filters.dateTo) {
        const fromDate = new Date(filters.dateFrom);
        const toDate = new Date(filters.dateTo);
        const sameYear = fromDate.getFullYear() === toDate.getFullYear();
        
        const fromFormatted = fromDate.toLocaleDateString('de-DE', { 
          day: '2-digit', 
          month: '2-digit', 
          year: sameYear ? undefined : 'numeric' 
        });
        const toFormatted = toDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        // If same date, show only one date
        if (filters.dateFrom === filters.dateTo) {
          return toFormatted;
        } else {
          return `${fromFormatted} - ${toFormatted}`;
        }
      } else if (filters.dateFrom) {
        const fromFormatted = new Date(filters.dateFrom).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        // Check if dateTo is empty or just whitespace
        const hasDateTo = filters.dateTo && filters.dateTo.trim() !== '';
        return hasDateTo ? `Ab ${fromFormatted}` : fromFormatted;
      } else if (filters.dateTo) {
        const toFormatted = new Date(filters.dateTo).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `Bis ${toFormatted}`;
      }
    }
    
    // Default: show nothing when no filters are set
    return "";
  };

  // When embedded (e.g., from Next.js /statistics), hide top agent dropdown
  const isEmbedded = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1';

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Preview Banner */}
      <div className="bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 text-center text-sm font-medium" data-testid="banner-preview">
        {t('banner.previewBuild')}
      </div>
      
      <div className="flex flex-1 min-h-0">
        {!sidebarCollapsed && (
        <FilterSidebar
          agents={agents}
          projects={projects}
          filters={filters}
          onFilterChange={handleFilterChange}
          isLoading={agentsLoading || projectsLoading}
          statistics={displayedStatistics}
          allStatistics={allStatistics}
          onTabChange={handleTabChange}
          onProjektDatesChange={handleProjektDatesChange}
          onAgentLocalDatesChange={handleAgentLocalDatesChange}
          agentDateFrom={agentDateFrom}
          agentDateTo={agentDateTo}
          isAutoSelectingProjects={isAutoSelectingProjects}
          onAutoSelectingProjectsChange={setIsAutoSelectingProjects}
          onSearchedForProjects={setHasSearchedForProjects}
          onLoadStatistics={handleLoadStatistics}
          lastSearchWasSuccessful={lastSearchWasSuccessful}
          hasEverSearchedSuccessfully={hasEverSearchedSuccessfully}
          filtersDirty={filtersDirty}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(true)}
        />)}

        {sidebarCollapsed && (
          <div className="w-10 bg-card border-r border-border flex flex-col items-center py-3">
            <button
              className="w-6 h-6 rounded hover:bg-accent flex items-center justify-center"
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <div className="bg-card border-b border-border px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-lg font-bold text-foreground">{getHeaderDisplay()}</span>
              </div>
            <div className="flex items-center space-x-4">
              {activeTab === 'agentendaten' && !isEmbedded && (
                <>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="collapse-all-toggle"
                      checked={collapseAllToggle}
                      onCheckedChange={handleCollapseAll}
                      data-testid="switch-collapse-all"
                    />
                    <Label 
                      htmlFor="collapse-all-toggle" 
                      className="text-sm font-medium cursor-pointer"
                    >
                      {t('header.collapseAll')}
                    </Label>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs w-48 justify-between"
                    onClick={() => setHeaderAgentPopupOpen(true)}
                    data-testid="button-header-agent-popup"
                  >
                    <span 
                      className="truncate"
                      key={`span-${(filters.agentIds || []).length}`}
                    >
                      {getDropdownAgentDisplay()}
                    </span>
                    <ChevronDown className="w-3 h-3 ml-1 flex-shrink-0" />
                  </Button>
                </>
              )}
              
              {/* REMOVED: Live-Anzeige moved to footer per user request */}
              
              <Button
                onClick={handleRefresh}
                size="sm"
                className="text-xs"
                data-testid="button-refresh"
                disabled={searchToken === 0}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {t('common.refresh')}
              </Button>
              
              <LanguageSwitcher />
              
              <SettingsDialog 
                projects={projects}
                projectsLoading={projectsLoading}
                projectTargets={projectTargets}
                targetsLoading={targetsLoading}
              />
            </div>
          </div>
        </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'agentendaten' ? (
            !filters.agentIds || filters.agentIds.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-lg text-muted-foreground mb-2">{t('filter.noAgentsSelected')}</p>
                  <p className="text-sm text-muted-foreground">{t('filter.selectAgents')}</p>
                </div>
              </div>
            ) : !agentDateFrom ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-lg text-muted-foreground mb-2">{t('filter.dateFrom')}</p>
                  <p className="text-sm text-muted-foreground">{t('filter.dateTo')}</p>
                </div>
              </div>
            ) : searchToken === 0 && displayedStatistics.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground mb-2">{t('filter.pleaseSearch')}</p>
                  <p className="text-sm text-muted-foreground">{t('filter.projectsAutoSelected')}</p>
                </div>
              </div>
            ) : !filters.projectIds || filters.projectIds.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  {isAutoSelectingProjects ? (
                    <>
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-3"></div>
                      <p className="text-lg text-muted-foreground mb-2">{t('emptyStates.searchingProjects')}</p>
                      <p className="text-sm text-muted-foreground">{t('emptyStates.autoSelectingProjects')}</p>
                    </>
                  ) : hasSearchedForProjects ? (
                    <>
                      <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-lg text-muted-foreground mb-2">{t('emptyStates.noProjectsWithCalls')}</p>
                      <p className="text-sm text-muted-foreground">{t('emptyStates.noCallsForAgents')}</p>
                    </>
                  ) : (
                    <>
                      <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-lg text-muted-foreground mb-2">{t('emptyStates.clickSearchButton')}</p>
                      <p className="text-sm text-muted-foreground">{t('emptyStates.projectsAutoDetected')}</p>
                    </>
                  )}
                </div>
              </div>
            ) : isFullyLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-3"></div>
                  <p className="text-lg text-muted-foreground mb-2">{t('emptyStates.loadingStatistics')}</p>
                  <p className="text-sm text-muted-foreground">{t('emptyStates.pleaseWait')}</p>
                </div>
              </div>
            ) : searchToken > 0 && displayedStatistics.length === 0 && !statisticsLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <p className="text-lg text-muted-foreground mb-2">{t('emptyStates.noStatisticsFound')}</p>
                  <p className="text-sm text-muted-foreground">{t('emptyStates.noDataForFilters')}</p>
                </div>
              </div>
            ) : (
              <AgentStatisticsTable
                agents={agents}
                projects={projects}
                statistics={displayedStatistics}
                statisticsLoading={statisticsLoading}
                filters={filters}
                onFilterChange={handleFilterChange}
                sortBy={agentSortBy}
                onSortChange={setAgentSortBy}
                expandedAgents={expandedAgents}
                setExpandedAgents={setExpandedAgents}
                expandedOutcomes={expandedOutcomes}
                setExpandedOutcomes={setExpandedOutcomes}
                expandedCallDetails={expandedCallDetails}
                setExpandedCallDetails={setExpandedCallDetails}
                expandedGroupIds={expandedGroupIds}
                setExpandedGroupIds={setExpandedGroupIds}
                expandedProjectCallDetails={expandedProjectCallDetails}
                setExpandedProjectCallDetails={setExpandedProjectCallDetails}
                expandedProjects={expandedProjects}
                setExpandedProjects={setExpandedProjects}
                expandedIndividualProjects={expandedIndividualProjects}
                setExpandedIndividualProjects={setExpandedIndividualProjects}
                callDetailsRefreshKey={callDetailsRefreshKey}
                showDetailColumns={showDetailColumns}
                setShowDetailColumns={setShowDetailColumns}
                hasSearched={searchToken > 0}
              />
            )
          ) : (
            <ProjectDataTable
              projects={projects}
              selectedProjects={filters.projectIds || []}
              dateFrom={projektDateFrom}
              dateTo={projektDateTo}
              statistics={displayedStatistics}
              agents={agents}
              projectTargets={projectTargets}
              targetsLoading={targetsLoading}
            />
          )}
          </div>
        </div>
      </div>
      
      {/* Footer */}
      {!isEmbedded && (
        <AppFooter 
          lastUpdateTime={lastUpdateTime}
          refetchIntervalMs={refetchIntervalMs}
          isEnabled={canAutoRefresh}
        />
      )}
      
      {/* Database Warning */}
      <DatabaseWarning 
        show={showDbWarning} 
        onDismiss={() => setShowDbWarning(false)}
      />
      
      {/* Dialfire API Warning */}
      <DialfireWarning 
        show={showDialfireWarning} 
        onDismiss={() => setShowDialfireWarning(false)}
      />
      
      {/* Unified Call Notification */}
      {activeNotification && (
        <UnifiedCallNotification
          agentName={activeNotification.agentName}
          projectName={activeNotification.projectName}
          outcome={activeNotification.outcome}
          category={activeNotification.category}
          count={activeNotification.count}
          delta={activeNotification.delta}
          time={activeNotification.time}
          dateRange={activeNotification.dateRange}
          isVisible={true}
          onDismiss={() => setActiveNotification(null)}
        />
      )}

      {/* Header Agent Selection Popup */}
      <AgentSelectionPopup
        agents={agents}
        selectedAgents={filters.agentIds || []}
        onAgentToggle={handleHeaderAgentToggle}
        onSelectAll={handleSelectAllAgents}
        isOpen={headerAgentPopupOpen}
        onClose={() => setHeaderAgentPopupOpen(false)}
        isLoading={agentsLoading}
        title="Agenten und Zeitraum auswählen"
        dateFrom={agentDateFrom}
        dateTo={agentDateTo}
        onDateFromChange={handleHeaderDateFromChange}
        onDateToChange={handleHeaderDateToChange}
        onSearch={handleHeaderSearch}
      />
    </div>
  );
}
