import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type Agent, type Project, type StatisticsFilter } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, ChevronLeft, Calendar, Hourglass, Headset, Bell, X, Check, Star } from "lucide-react";
import { useCyprusTime } from "@/hooks/use-cyprus-time";
import AgentSelectionPopup from "@/components/agent-selection-popup";

interface FilterSidebarProps {
  agents: Agent[];
  projects: Project[];
  filters: StatisticsFilter;
  onFilterChange: (filters: StatisticsFilter) => void;
  isLoading: boolean;
  statistics?: any[]; // For agent-project relationship
  allStatistics?: any[]; // Complete unfiltered agent-project relationships
  onTabChange?: (tab: 'agentendaten' | 'projektdaten') => void;
  onProjektDatesChange?: (dateFrom: string, dateTo: string) => void;
  onAgentLocalDatesChange?: (dateFrom: string, dateTo: string) => void;
  agentDateFrom?: string; // Current agent dates from Dashboard for synchronization
  agentDateTo?: string;
  isAutoSelectingProjects?: boolean;
  onAutoSelectingProjectsChange?: (isSelecting: boolean) => void;
  onSearchedForProjects?: (hasSearched: boolean) => void;
  onLoadStatistics?: () => void;
  lastSearchWasSuccessful?: boolean;
  hasEverSearchedSuccessfully?: boolean;
  filtersDirty?: boolean;
  // Collapsible sidebar controls
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function FilterSidebar({
  agents,
  projects,
  filters,
  onFilterChange,
  isLoading,
  statistics = [],
  allStatistics = [],
  onTabChange,
  onProjektDatesChange,
  onAgentLocalDatesChange,
  agentDateFrom,
  agentDateTo,
  isAutoSelectingProjects,
  onAutoSelectingProjectsChange,
  onSearchedForProjects,
  onLoadStatistics,
  lastSearchWasSuccessful,
  hasEverSearchedSuccessfully,
  filtersDirty,
  collapsed,
  onToggleCollapse
}: FilterSidebarProps) {
  const { t } = useTranslation();
  const [agentPopupOpen, setAgentPopupOpen] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(filters.agentIds || []);
  // Separate project selections for each tab
  const [selectedProjectsAgenten, setSelectedProjectsAgenten] = useState<string[]>([]);
  const [selectedProjectsProjekte, setSelectedProjectsProjekte] = useState<string[]>([]);
  
  // Track if user has explicitly selected agents to prevent automatic selection
  const userPickedAgentsRef = useRef(false);
  
  // Add debounce timeout for automatic project selection
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  
  // Get current projects based on active tab
  const getCurrentSelectedProjects = () => {
    return activeTab === 'agentendaten' ? selectedProjectsAgenten : selectedProjectsProjekte;
  };
  
  const setCurrentSelectedProjects = (projects: string[]) => {
    if (activeTab === 'agentendaten') {
      setSelectedProjectsAgenten(projects);
    } else {
      setSelectedProjectsProjekte(projects);
    }
  };
  const [activeTab, setActiveTab] = useState<'agentendaten' | 'projektdaten'>('agentendaten');
  const [projektDateFrom, setProjektDateFrom] = useState('');
  const [projektDateTo, setProjektDateTo] = useState('');
  
  // Local date states for agentendaten tab (don't update filters automatically)
  const [localDateFrom, setLocalDateFrom] = useState(filters.dateFrom || '');
  const [localDateTo, setLocalDateTo] = useState(filters.dateTo || '');
  
  // Initialize local dates only on popup open transition (not on filter changes)
  const wasAgentPopupOpen = useRef(false);
  useEffect(() => {
    if (agentPopupOpen && !wasAgentPopupOpen.current) {
      // Only initialize when transitioning from closed to open
      setLocalDateFrom(filters.dateFrom || '');
      setLocalDateTo(filters.dateTo || '');
    }
    wasAgentPopupOpen.current = agentPopupOpen;
  }, [agentPopupOpen]);
  
  // Time filter state (also local - don't update filters automatically)
  const [localTimeFrom, setLocalTimeFrom] = useState(filters.timeFrom || '');
  const [localTimeTo, setLocalTimeTo] = useState(filters.timeTo || '');
  
  // Keep old time states for backwards compatibility  
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  
  // Use Cyprus time instead of local time
  const { currentTime } = useCyprusTime();
  

  // Synchronize local dates with Dashboard agent dates (for two-way sync)
  useEffect(() => {
    if (agentDateFrom !== undefined && agentDateFrom !== localDateFrom) {
      setLocalDateFrom(agentDateFrom);
    }
    if (agentDateTo !== undefined && agentDateTo !== localDateTo) {
      setLocalDateTo(agentDateTo);
    }
  }, [agentDateFrom, agentDateTo]);

  // Notify dashboard about local date changes
  useEffect(() => {
    if (onAgentLocalDatesChange && activeTab === 'agentendaten') {
      onAgentLocalDatesChange(localDateFrom, localDateTo);
    }
  }, [localDateFrom, localDateTo, activeTab, onAgentLocalDatesChange]);

  // Handle tab change
  const handleTabChange = (tab: 'agentendaten' | 'projektdaten') => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Handle project date changes
  const handleProjektDateChange = (type: 'from' | 'to', value: string) => {
    let newFromDate = type === 'from' ? value : projektDateFrom;
    let newToDate = type === 'to' ? value : projektDateTo;
    
    // Validate dates: ensure from <= to
    if (type === 'from') {
      setProjektDateFrom(value);
      // If to date exists and from is greater than to, adjust to date
      if (projektDateTo && value > projektDateTo) {
        newToDate = value;
        setProjektDateTo(value);
      }
    } else {
      setProjektDateTo(value);
      // If from date exists and to is less than from, adjust from date
      if (projektDateFrom && value < projektDateFrom) {
        newFromDate = value;
        setProjektDateFrom(value);
      }
    }
    
    if (onProjektDatesChange) {
      onProjektDatesChange(newFromDate, newToDate);
    }
  };

  // Synchronize local state with filters
  useEffect(() => {
    const newSelectedAgents = filters.agentIds || [];
    // Always update selectedAgents when filters.agentIds changes
    setSelectedAgents(newSelectedAgents);
    
    // If filters contain agentIds, it means user has made a selection
    if (newSelectedAgents.length > 0) {
      userPickedAgentsRef.current = true;
    }
  }, [filters.agentIds]);

  useEffect(() => {
    // This synchronizes filters with current tab selection - only for Agentendaten tab
    if (activeTab === 'agentendaten') {
      setSelectedProjectsAgenten(filters.projectIds || []);
    }
  }, [filters.projectIds, activeTab]);

  // Cyprus time is now handled by the useCyprusTime hook

  // Calculate week number
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
  
  const currentWeek = getWeekNumber(currentTime);
  
  // Format Cyprus time for display
  const formattedDate = currentTime.toLocaleDateString('de-DE', { 
    weekday: 'short', 
    day: '2-digit', 
    month: '2-digit', 
    year: '2-digit' 
  });
  const formattedTime = currentTime.toLocaleTimeString('de-DE', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  // Cached available projects state
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingProjectsWithCallData, setLoadingProjectsWithCallData] = useState(false);
  
  // Get available projects based on selected agents using cached data first, API as fallback
  const getAvailableProjects = () => {
    return availableProjects;
  };

  // Load projects for selected agents (fallback for when cache is not available)
  const loadProjectsForAgents = async (agentIds: string[]) => {
    if (agentIds.length === 0) {
      return [];
    }
    
    try {
      const response = await fetch('/api/projects-for-agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agentIds }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch projects for agents: ${response.status}`);
      }
      
      const text = await response.text();
      if (!text) {
        return [];
      }
      
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse JSON response:', text);
        throw new Error('Invalid JSON response from server');
      }
    } catch (error) {
      console.error('Error loading projects for agents:', error);
      return projects; // Fallback to all projects
    }
  };

  // DISABLED: Update available projects when selected agents change
  // This causes too many parallel API calls and performance issues
  /*
  useEffect(() => {
    const updateAvailableProjects = async () => {
      if (selectedAgents.length === 0) {
        setAvailableProjects([]);
        setLoadingProjects(false);
        return;
      }
      
      // Set loading state immediately when agents are selected
      setLoadingProjects(true);
      
      try {
        // First try to use cached statistics data
        if (allStatistics && allStatistics.length > 0) {
          const availableProjectIds = new Set<string>();
          allStatistics.forEach((stat: any) => {
            if (selectedAgents.includes(stat.agentId)) {
              availableProjectIds.add(stat.projectId);
            }
          });
          
          const cachedProjects = projects.filter(project => availableProjectIds.has(project.id));
          setAvailableProjects(cachedProjects);
          return;
        }
        
        // Fallback to API if cache is not available
        const relevantProjects = await loadProjectsForAgents(selectedAgents);
        setAvailableProjects(relevantProjects);
      } finally {
        setLoadingProjects(false);
      }
    };
    
    updateAvailableProjects();
  }, [selectedAgents, projects, allStatistics]);
  */

  // Manual project selection function (triggered by "Statistiken suchen" button)
  const performManualProjectSelection = async () => {
    // Mark that user has searched for projects
    if (onSearchedForProjects) {
      onSearchedForProjects(true);
    }
    
    // Get today's date in YYYY-MM-DD format (local timezone)
    const today = new Date().toLocaleDateString('sv-SE');
    
    // Get the correct date fields based on active tab (use local states for agentendaten)
    let dateFrom = activeTab === 'agentendaten' ? localDateFrom : projektDateFrom;
    let dateTo = activeTab === 'agentendaten' ? localDateTo : projektDateTo;
    
    // If dateFrom is in the future, set it to today and clear dateTo
    if (dateFrom && dateFrom > today) {
      dateFrom = today;
      dateTo = '';
      
      // Update the local state to reflect the adjustment
      if (activeTab === 'agentendaten') {
        setLocalDateFrom(today);
        setLocalDateTo('');
      } else {
        setProjektDateFrom(today);
        setProjektDateTo('');
        // Notify dashboard about projekt date change
        if (onProjektDatesChange) {
          onProjektDatesChange(today, '');
        }
      }
    }
    // If dateTo is greater than today, adjust it to today
    else if (dateTo && dateTo > today) {
      dateTo = today;
      
      // Update the local state to reflect the adjustment
      if (activeTab === 'agentendaten') {
        setLocalDateTo(today);
      } else {
        setProjektDateTo(today);
        // Notify dashboard about projekt date change
        if (onProjektDatesChange) {
          onProjektDatesChange(dateFrom, today);
        }
      }
    }
    
    // Prepare updated filters with adjusted date values for both tabs
    const updatedFilters = activeTab === 'agentendaten' ? {
      ...filters,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      timeFrom: localTimeFrom || undefined,
      timeTo: localTimeTo || undefined,
    } : {
      ...filters,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };
    
    // Update filters
    if (activeTab === 'agentendaten') {
      onFilterChange(updatedFilters);
    }
    
    // Only trigger selection if we have agents AND at least one date is selected
    if (selectedAgents.length === 0 || (!dateFrom && !dateTo)) {
      return;
    }
    
    // Get current manually selected projects
    const currentProjects = getCurrentSelectedProjects();
    
    // Check if projects are already manually selected
    const hasManuallySelectedProjects = currentProjects.length > 0 || (filters.projectIds && filters.projectIds.length > 0);
    
    if (hasManuallySelectedProjects) {
      // Projects already selected - use them directly without automatic search
      console.log('✅ Using manually selected projects:', currentProjects);
      
      // Prepare final filters with project selection and adjusted dates
      const finalFilters = {
        ...updatedFilters,
        projectIds: currentProjects.length > 0 ? currentProjects : updatedFilters.projectIds,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      
      // Update filters and immediately trigger statistics load
      onFilterChange(finalFilters);
      
      // Load statistics when button is clicked (with small delay to ensure filter update)
      if (onLoadStatistics) {
        setTimeout(() => {
          onLoadStatistics();
        }, 100);
      }
      
      return;
    }
    
    // No projects selected - perform automatic project search
    console.log('🔍 No projects selected - performing automatic project search');
    
    // If dateTo is not set, use dateFrom (single day)
    const effectiveDateTo = dateTo || dateFrom;
    
    // Set loading state to show user that something is happening
    setLoadingProjects(true);
    if (onAutoSelectingProjectsChange) {
      onAutoSelectingProjectsChange(true);
    }

    try {
      // Step 1: Get ALL projects for the selected agents (for dropdown)
      console.log('🔍 Step 1: Fetching all projects for selected agents...');
      const allProjectsResponse = await fetch('/api/projects-for-agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentIds: selectedAgents
        }),
      });

      if (!allProjectsResponse.ok) {
        console.error('❌ Failed to fetch all projects for agents:', allProjectsResponse.status);
        return;
      }

      const allAgentProjects = await allProjectsResponse.json();
      console.log(`🔍 Found ${allAgentProjects.length} total projects for selected agents`);
      
      // Set these as available projects for dropdown
      setAvailableProjects(allAgentProjects);

      // Step 2: Get projects with calls for the specific timeframe (for auto-selection)
      console.log('🔍 Step 2: Fetching projects with calls for timeframe...');
      setLoadingProjectsWithCallData(true);
      const callsResponse = await fetch('/api/projects-with-calls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentIds: selectedAgents,
          dateFrom: dateFrom,
          dateTo: effectiveDateTo,
          timeFrom: activeTab === 'agentendaten' ? localTimeFrom : undefined,
          timeTo: activeTab === 'agentendaten' ? localTimeTo : undefined
        }),
      });

      if (!callsResponse.ok) {
        console.error('❌ Failed to fetch projects with calls:', callsResponse.status);
        return;
      }

      const projectIdsWithCalls = await callsResponse.json();
      console.log(`🔍 Auto-selecting ${projectIdsWithCalls.length} projects with data for timeframe`);
      
      // Auto-select only projects that have data for the timeframe
      setCurrentSelectedProjects(projectIdsWithCalls);
      
      // Prepare final filters with project selection and dates
      const finalFilters = {
        ...updatedFilters,
        projectIds: projectIdsWithCalls
      };
      
      // Update parent component with new selection
      onFilterChange(finalFilters);
      
      // Load statistics when button is clicked and projects are found (with small delay)
      if (onLoadStatistics) {
        setTimeout(() => {
          onLoadStatistics();
        }, 100);
      }

    } catch (error) {
      console.error('Error in manual project selection:', error);
    } finally {
      setLoadingProjects(false);
      setLoadingProjectsWithCallData(false);
      if (onAutoSelectingProjectsChange) {
        onAutoSelectingProjectsChange(false);
      }
    }
  };

  // DISABLED: Load available projects when agents are selected 
  // This also causes parallel API calls - projects now load only when button is clicked
  /*
  useEffect(() => {
    const loadProjectsForAgents = async () => {
      if (selectedAgents.length > 0) {
        
        try {
          const response = await fetch('/api/projects-for-agents', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              agentIds: selectedAgents
            }),
          });

          if (response.ok) {
            const agentProjects = await response.json();
            setAvailableProjects(agentProjects);
          } else {
            console.error('❌ useEffect: Failed to fetch projects for agents:', response.status);
          }
        } catch (error) {
          console.error('❌ useEffect: Error loading projects for agents:', error);
        }
      } else {
        // No agents selected - clear available projects
        setAvailableProjects([]);
      }
    };

    loadProjectsForAgents();
  }, [selectedAgents]);
  */

  const handleSelectAllProjects = (checked: boolean) => {
    const availableProjects = getAvailableProjects();
    const newSelectedProjects = checked 
      ? availableProjects.map(project => project.id)
      : [];
    
    setCurrentSelectedProjects(newSelectedProjects);
    
    const newFilters = {
      ...filters,
      projectIds: newSelectedProjects.length > 0 ? newSelectedProjects : undefined
    };
    
    onFilterChange(newFilters);
  };

  const handleAgentToggle = async (agentId: string, checked: boolean) => {
    // Mark that user has explicitly selected agents
    userPickedAgentsRef.current = true;
    
    const newSelectedAgents = checked 
      ? [...selectedAgents, agentId]
      : selectedAgents.filter(id => id !== agentId);
    
    setSelectedAgents(newSelectedAgents);
    
    // Check if current project selection is still valid
    const newFilters = {
      ...filters,
      agentIds: newSelectedAgents.length > 0 ? newSelectedAgents : undefined
    };
    
    // IMMEDIATELY UPDATE PARENT - this fixes header dropdown sync
    console.log('🔧 IMMEDIATE onFilterChange with:', newFilters);
    onFilterChange(newFilters);
    
    // Only clear projects when no agents are selected
    if (newSelectedAgents.length === 0) {
      setCurrentSelectedProjects([]);
      setAvailableProjects([]);
      newFilters.projectIds = undefined;
    } else {
      try {
        // Load all projects for the selected agents immediately
        console.log('🔍 Loading available projects for agents:', newSelectedAgents);
        const allProjectsResponse = await fetch('/api/projects-for-agents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agentIds: newSelectedAgents
          }),
        });

        if (allProjectsResponse.ok) {
          const allAgentProjects = await allProjectsResponse.json();
          console.log(`🔍 Found ${allAgentProjects.length} available projects for selected agents`);
          
          // Set these as available projects for dropdown (enables dropdown)
          setAvailableProjects(allAgentProjects);
          
          // Keep only projects that are still valid for the new agent selection
          const currentProjects = getCurrentSelectedProjects();
          const availableProjectIds = allAgentProjects.map((p: any) => p.id);
          const validSelectedProjects = currentProjects.filter(projectId => 
            availableProjectIds.includes(projectId)
          );
          
          // Always update the filters with the valid project selection
          setCurrentSelectedProjects(validSelectedProjects);
          newFilters.projectIds = validSelectedProjects.length > 0 ? validSelectedProjects : undefined;
        } else {
          console.error('❌ Failed to fetch projects for agents:', allProjectsResponse.status);
          // Fallback to statistics-based approach
          const availableProjectIds = new Set<string>();
          if (allStatistics && allStatistics.length > 0) {
            allStatistics.forEach((stat: any) => {
              if (newSelectedAgents.includes(stat.agentId)) {
                availableProjectIds.add(stat.projectId);
              }
            });
          }
          
          const availableProjectsList = projects.filter(project => availableProjectIds.has(project.id));
          setAvailableProjects(availableProjectsList);
          
          const currentProjects = getCurrentSelectedProjects();
          const validSelectedProjects = currentProjects.filter(projectId => 
            availableProjectIds.has(projectId)
          );
          
          setCurrentSelectedProjects(validSelectedProjects);
          newFilters.projectIds = validSelectedProjects.length > 0 ? validSelectedProjects : undefined;
        }
      } catch (error) {
        console.error('Error loading projects for agents:', error);
        // Clear projects on error
        setAvailableProjects([]);
        setCurrentSelectedProjects([]);
        newFilters.projectIds = undefined;
      }
    }
    
    // onFilterChange already called immediately above for sync
  };

  const handleSelectAllAgents = (checked: boolean) => {
    // Mark that user has explicitly selected agents
    userPickedAgentsRef.current = true;
    
    if (checked) {
      // Select all agents
      const allAgentIds = agents.map(agent => agent.id);
      setSelectedAgents(allAgentIds);
      
      // Auto-select all available projects for all agents
      const availableProjectIds = new Set<string>();
      if (allStatistics && allStatistics.length > 0) {
        allStatistics.forEach((stat: any) => {
          if (allAgentIds.includes(stat.agentId)) {
            availableProjectIds.add(stat.projectId);
          }
        });
      }
      const allAvailableProjectIds = Array.from(availableProjectIds);
      setCurrentSelectedProjects(allAvailableProjectIds);
      
      onFilterChange({ 
        ...filters, 
        agentIds: allAgentIds,
        projectIds: allAvailableProjectIds.length > 0 ? allAvailableProjectIds : undefined
      });
    } else {
      // Deselect all agents
      setSelectedAgents([]);
      setCurrentSelectedProjects([]);
      onFilterChange({ ...filters, agentIds: undefined, projectIds: undefined });
    }
  };

  const handleDateFromChange = (dateFrom: string) => {
    // Update local date state only - don't trigger automatic filter updates
    setLocalDateFrom(dateFrom);
    // Note: onAgentLocalDatesChange is called automatically by useEffect
  };

  const handleDateToChange = (dateTo: string) => {
    // Update local date state only - don't trigger automatic filter updates
    setLocalDateTo(dateTo);
    
    // If dateTo is smaller than dateFrom, adjust dateFrom to match dateTo
    if (localDateFrom && dateTo && dateTo < localDateFrom) {
      setLocalDateFrom(dateTo);
    }
    // Note: onAgentLocalDatesChange is called automatically by useEffect
  };


  const handleTimeFromChange = (time: string) => {
    // Update local time state only - don't trigger automatic filter updates
    setLocalTimeFrom(time);
  };

  const handleTimeToChange = (time: string) => {
    // Update local time state only - don't trigger automatic filter updates
    setLocalTimeTo(time);
  };


  const handleProjectToggle = (projectId: string, checked: boolean) => {
    const currentProjects = getCurrentSelectedProjects();
    const newSelectedProjects = checked 
      ? [...currentProjects, projectId]
      : currentProjects.filter(id => id !== projectId);
    
    setCurrentSelectedProjects(newSelectedProjects);
    onFilterChange({
      ...filters,
      projectIds: newSelectedProjects.length > 0 ? newSelectedProjects : undefined
    });
  };

  const handleProjectChange = (projectIds: string[]) => {
    onFilterChange({ 
      ...filters, 
      projectIds: projectIds.length > 0 ? projectIds : undefined 
    });
  };

  // Enhanced function to check if date range is a calendar week (Monday-Sunday, Monday-Friday, or Monday-Saturday)
  const getSelectedWeekInfo = () => {
    if (!filters.dateFrom || !filters.dateTo) return null;
    
    const fromDate = new Date(filters.dateFrom);
    const toDate = new Date(filters.dateTo);
    
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
  
  // Check if the projekt date range is a calendar week
  const getProjektSelectedWeekInfo = () => {
    if (!projektDateFrom || !projektDateTo) return null;
    
    const fromDate = new Date(projektDateFrom);
    const toDate = new Date(projektDateTo);
    
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
  
  // Check if the projekt date range is exactly one full month
  const getProjektSelectedMonthInfo = () => {
    if (!projektDateFrom || !projektDateTo) return null;
    
    const fromDate = new Date(projektDateFrom);
    const toDate = new Date(projektDateTo);
    
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
  const projektSelectedWeek = getProjektSelectedWeekInfo();
  const projektSelectedMonth = getProjektSelectedMonthInfo();

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="mr-1"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Calendar className="w-6 h-6 mr-2 text-foreground/80" />
            <div>
              <div className="text-xs text-muted-foreground">Datum</div>
              <div className="font-semibold text-foreground" data-testid="text-current-date">{formattedDate}</div>
            </div>
          </div>
          <div className="text-2xl font-semibold text-foreground" data-testid="text-current-time">{formattedTime}</div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex-1 p-4 space-y-5 overflow-y-auto">
        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={(value) => handleTabChange(value as 'agentendaten' | 'projektdaten')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="agentendaten" data-testid="tab-agentendaten">{t('tabs.agentData')}</TabsTrigger>
            <TabsTrigger value="projektdaten" data-testid="tab-projektdaten" disabled>{t('tabs.projectData')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="agentendaten" className="space-y-6 mt-6">
            {/* Date Filters - Agentendaten */}
            <div className="space-y-2">
              {/* Date Range */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="date-from-input" className="text-sm font-medium">{t('common.from')}</Label>
                  <Input
                    id="date-from-input"
                    type="date"
                    value={localDateFrom || ""}
                    onChange={(e) => handleDateFromChange(e.target.value)}
                    className="w-40"
                    data-testid="input-date-from"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="date-to-input" className="text-sm font-medium">{t('common.to')}</Label>
                  <Input
                    id="date-to-input"
                    type="date"
                    value={localDateTo || ""}
                    onChange={(e) => handleDateToChange(e.target.value)}
                    className="w-40"
                    data-testid="input-date-to"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                
                {/* Time Range Filter - DISABLED per user request */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-muted-foreground">{t('common.time')}</Label>
                  <div className="flex space-x-2 w-40">
                    <Input
                      id="time-from-input"
                      type="time"
                      value={localTimeFrom}
                      onChange={(e) => {
                        setLocalTimeFrom(e.target.value);
                      }}
                      className="w-[75px]"
                      data-testid="input-time-from"
                      disabled
                    />
                    <Input
                      id="time-to-input"
                      type="time"
                      value={localTimeTo}
                      onChange={(e) => {
                        setLocalTimeTo(e.target.value);
                      }}
                      className="w-[75px]"
                      data-testid="input-time-to"
                      disabled
                    />
                  </div>
                </div>
                
                <div className="flex justify-end h-3 mt-0 mr-3">
                  {selectedWeek && (
                    <span className="text-xs text-muted-foreground">
                      KW{selectedWeek}
                    </span>
                  )}
                  {selectedMonth && !selectedWeek && (
                    <span className="text-xs text-muted-foreground">
                      {selectedMonth}
                    </span>
                  )}
                </div>
              </div>

              {/* Los Button */}
              <div className="flex justify-center mt-4">
                <Button
                  onClick={performManualProjectSelection}
                  disabled={selectedAgents.length === 0 || (!localDateFrom && !localDateTo) || isLoading || isAutoSelectingProjects}
                  className="w-[95%] h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-sm"
                  data-testid="button-los"
                >
                  {isLoading || isAutoSelectingProjects ? t('common.loading') : t('filter.searchStatistics')}
                </Button>
              </div>

            </div>

            {/* Separator */}
            <Separator className="my-4 h-0.5 bg-border" />

            {/* Agent Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center shrink-0">
                  <Headset className="w-5 h-5 mr-2 text-foreground/80" />
                </div>
                <div className="relative">
                  <Button 
                    variant="outline" 
                    className="w-40 justify-between" 
                    onClick={() => setAgentPopupOpen(true)}
                    data-testid="button-agent-popup"
                  >
                    <span className="text-muted-foreground text-sm truncate">
                      {isLoading ? t('filter.loadingAgents') : selectedAgents.length === 0 
                        ? t('filter.selectAgent')
                        : t('filter.agentsCount', { count: selectedAgents.length })}
                    </span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Agent List with compact checkboxes */}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {agents.map((agent) => {
                  const checked = selectedAgents.includes(agent.id);
                  return (
                    <label key={agent.id} className="flex items-center gap-3 p-2 rounded hover:bg-accent cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(val) => handleAgentToggle(agent.id, !!val)}
                      />
                      <span className="text-sm text-foreground truncate">{agent.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Project Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center shrink-0">
                  <Star className="w-5 h-5 mr-2 text-foreground/80" />
                </div>
                <div className="relative">
                  <DropdownMenu open={projectDropdownOpen} onOpenChange={setProjectDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-40 justify-between" 
                        data-testid="button-project-dropdown"
                        disabled={selectedAgents.length === 0 || !hasEverSearchedSuccessfully}
                      >
                        <span className="text-muted-foreground text-sm truncate">
                          {loadingProjectsWithCallData ? t('filter.loadingProjectsWithCalls') :
                           loadingProjects ? t('filter.loadingProjects') : 
                           selectedAgents.length === 0
                            ? t('filter.selectProject')
                            : getCurrentSelectedProjects().length === 0 
                            ? t('filter.selectProject')
                            : t('filter.projectsCount', { count: getCurrentSelectedProjects().length })}
                        </span>
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                
                    <DropdownMenuContent className="w-64 max-h-48 overflow-y-auto" align="end">
                      {(loadingProjects || loadingProjectsWithCallData) ? (
                        <DropdownMenuItem className="flex items-center justify-center p-4">
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-800 dark:border-gray-200 mx-auto mb-2"></div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {loadingProjectsWithCallData ? t('filter.loadingProjectsWithCalls') : t('filter.loadingProjects')}
                            </p>
                          </div>
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem
                            className="flex items-center space-x-2 p-2 border-b border-border"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Checkbox
                              id="project-select-all"
                              checked={getCurrentSelectedProjects().length === getAvailableProjects().length && getAvailableProjects().length > 0}
                              onCheckedChange={(checked) => handleSelectAllProjects(checked as boolean)}
                              data-testid="checkbox-project-select-all"
                            />
                            <Label 
                              htmlFor="project-select-all" 
                              className="text-sm font-medium text-foreground cursor-pointer flex-1"
                            >
                              Alle auswählen
                            </Label>
                          </DropdownMenuItem>
                          {getAvailableProjects().map((project) => (
                            <DropdownMenuItem
                              key={project.id}
                              className="flex items-center space-x-2 p-2"
                              onSelect={(e) => e.preventDefault()}
                            >
                              <Checkbox
                                id={`project-${project.id}`}
                                checked={getCurrentSelectedProjects().includes(project.id)}
                                onCheckedChange={(checked) => handleProjectToggle(project.id, checked as boolean)}
                                data-testid={`checkbox-project-${project.id}`}
                              />
                              <Label 
                                htmlFor={`project-${project.id}`} 
                                className="flex-1 cursor-pointer text-foreground"
                              >
                                {project.name}
                              </Label>
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="projektdaten" className="space-y-6 mt-6">
            {/* Date Filters - Projektdaten */}
            <div className="space-y-2">
              {/* Date Range for Projektdaten */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="projekt-date-from-input" className="text-sm font-medium">Von</Label>
                  <Input
                    id="projekt-date-from-input"
                    type="date"
                    value={projektDateFrom}
                    onChange={(e) => handleProjektDateChange('from', e.target.value)}
                    className="w-40"
                    data-testid="input-projekt-date-from"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="projekt-date-to-input" className="text-sm font-medium">Bis</Label>
                  <Input
                    id="projekt-date-to-input"
                    type="date"
                    value={projektDateTo}
                    onChange={(e) => handleProjektDateChange('to', e.target.value)}
                    className="w-40"
                    data-testid="input-projekt-date-to"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="flex justify-end h-3 mt-0 mr-3">
                  {projektSelectedWeek && (
                    <span className="text-xs text-muted-foreground">
                      KW{projektSelectedWeek}
                    </span>
                  )}
                  {projektSelectedMonth && !projektSelectedWeek && (
                    <span className="text-xs text-muted-foreground">
                      {projektSelectedMonth}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Separator */}
            <Separator className="my-4 h-0.5 bg-border" />

            {/* Project Selection for Projektdaten */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center shrink-0">
                  <Star className="w-10 h-10 mr-2" />
                </div>
                <div className="relative">
                  <DropdownMenu open={projectDropdownOpen} onOpenChange={setProjectDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-40 justify-between" 
                        data-testid="button-projektdaten-project-dropdown"
                        disabled={selectedAgents.length === 0 || !projektDateFrom || !projektDateTo || !hasEverSearchedSuccessfully}
                      >
                        <span className="text-muted-foreground text-sm truncate">
                          {loadingProjectsWithCallData ? t('filter.loadingProjectsWithCalls') :
                           loadingProjects ? t('filter.loadingProjects') :
                           selectedAgents.length === 0
                            ? t('filter.selectProject')
                            : getCurrentSelectedProjects().length === 0 
                            ? t('filter.selectProject')
                            : t('filter.projectsCount', { count: getCurrentSelectedProjects().length })}
                        </span>
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                
                    <DropdownMenuContent className="w-64 max-h-48 overflow-y-auto" align="end">
                      {(loadingProjects || loadingProjectsWithCallData) ? (
                        <DropdownMenuItem className="flex items-center justify-center p-4">
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-800 dark:border-gray-200 mx-auto mb-2"></div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {loadingProjectsWithCallData ? t('filter.loadingProjectsWithCalls') : t('filter.loadingProjects')}
                            </p>
                          </div>
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem
                            className="flex items-center space-x-2 p-2 border-b border-border"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Checkbox
                              id="projektdaten-project-select-all"
                              checked={getCurrentSelectedProjects().length === projects.length && projects.length > 0}
                              onCheckedChange={(checked) => {
                                const newSelectedProjects = checked 
                                  ? projects.map(project => project.id)
                                  : [];
                                
                                setCurrentSelectedProjects(newSelectedProjects);
                                
                                const newFilters = {
                                  ...filters,
                                  projectIds: newSelectedProjects.length > 0 ? newSelectedProjects : undefined
                                };
                                
                                onFilterChange(newFilters);
                              }}
                              data-testid="checkbox-projektdaten-project-select-all"
                            />
                            <Label 
                              htmlFor="projektdaten-project-select-all" 
                              className="text-sm font-medium text-foreground cursor-pointer flex-1"
                            >
                              Alle auswählen
                            </Label>
                          </DropdownMenuItem>
                          {projects.map((project) => (
                            <DropdownMenuItem
                              key={project.id}
                              className="flex items-center space-x-2 p-2"
                              onSelect={(e) => e.preventDefault()}
                            >
                              <Checkbox
                                id={`projektdaten-project-${project.id}`}
                                checked={getCurrentSelectedProjects().includes(project.id)}
                                onCheckedChange={(checked) => handleProjectToggle(project.id, checked as boolean)}
                                data-testid={`checkbox-projektdaten-project-${project.id}`}
                              />
                              <Label 
                                htmlFor={`projektdaten-project-${project.id}`} 
                                className="flex-1 cursor-pointer text-foreground"
                              >
                                {project.name}
                              </Label>
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              
              {/* Project List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {projects.map((project) => (
                  <div key={project.id} className="flex items-center justify-between p-2 hover:bg-accent rounded cursor-pointer">
                    <div 
                      className="flex items-center space-x-3 flex-1"
                      onClick={() => handleProjectToggle(project.id, !getCurrentSelectedProjects().includes(project.id))}
                    >
                      <span className="text-sm text-foreground">{project.name}</span>
                    </div>
                    <div 
                      className="flex items-center justify-center w-6 h-6 bg-white border border-gray-300 rounded cursor-pointer"
                      onClick={() => handleProjectToggle(project.id, !getCurrentSelectedProjects().includes(project.id))}
                    >
                      {getCurrentSelectedProjects().includes(project.id) && (
                        <X className="w-4 h-4 text-black" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Agent Selection Popup */}
        <AgentSelectionPopup
          agents={agents}
          selectedAgents={selectedAgents}
          onAgentToggle={handleAgentToggle}
          onSelectAll={handleSelectAllAgents}
          isOpen={agentPopupOpen}
          onClose={() => setAgentPopupOpen(false)}
          isLoading={isLoading}
          title={t('filter.selectAgents')}
          dateFrom={localDateFrom}
          dateTo={localDateTo}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onSearch={performManualProjectSelection}
        />

      </div>
    </div>
  );
}
