import { useState, useEffect } from "react";
import { type Project, type ProjectTargets } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Target, Users, TrendingUp, Calendar, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface ProjectDataTableProps {
  projects: Project[];
  selectedProjects: string[];
  dateFrom: string;
  dateTo: string;
  statistics?: any[];
  agents: any[]; // Add agents prop to avoid duplicate API call
  projectTargets?: ProjectTargets[]; // Add projectTargets prop to avoid duplicate API call
  targetsLoading?: boolean;
}

type SortOption = 'performance-desc' | 'performance-asc' | 'name-asc' | 'name-desc';

export default function ProjectDataTable({
  projects,
  selectedProjects,
  dateFrom,
  dateTo,
  statistics = [],
  agents,
  projectTargets = [],
  targetsLoading = false
}: ProjectDataTableProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('performance-desc');

  // Use agents from props instead of separate query to avoid duplicate API calls

  // Project targets now come from props to avoid duplicate API calls


  // Generate date columns based on selected range
  const generateDateColumns = () => {
    if (!dateFrom && !dateTo) return [];
    
    const columns: { day: number, isWeekend: boolean, date: Date }[] = [];
    const startDate = dateFrom ? new Date(dateFrom) : new Date(dateTo);
    const endDate = dateTo ? new Date(dateTo) : new Date(dateFrom);
    
    // If same day, just show that day
    if (startDate.toDateString() === endDate.toDateString()) {
      const dayOfWeek = startDate.getDay();
      columns.push({
        day: startDate.getDate(),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        date: new Date(startDate)
      });
      return columns;
    }
    
    // Generate columns for date range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      columns.push({
        day: currentDate.getDate(),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        date: new Date(currentDate)
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return columns;
  };

  const dateColumns = generateDateColumns();
  
  // Get Soll value for project
  const getSollValue = (projectId: string) => {
    const target = projectTargets?.find(t => t.projectId === projectId);
    return target?.targetValue ?? 0;
  };

  // Calculate performance percentage
  const calculatePerf = (actual: number, soll: number) => {
    if (soll === 0) return 0;
    return Math.round((actual / soll) * 100);
  };
  
  // Filter and sort projects based on selection
  const filteredProjects = selectedProjects.length > 0 
    ? projects.filter(p => selectedProjects.includes(p.id))
    : [];

  // Sort projects based on selected sort option
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const sollA = getSollValue(a.id);
    const sollB = getSollValue(b.id);
    const actualA = 0; // TODO: Calculate from real data
    const actualB = 0; // TODO: Calculate from real data
    const perfA = calculatePerf(actualA, sollA);
    const perfB = calculatePerf(actualB, sollB);

    switch (sortBy) {
      case 'performance-desc':
        return perfB - perfA;
      case 'performance-asc':
        return perfA - perfB;
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      default:
        return 0;
    }
  });
  
  // Get unique agents for selected projects from statistics and all available agents
  const getProjectAgents = (projectId: string) => {
    // Get agents from statistics for this project
    const projectStats = statistics.filter(stat => stat.projectId === projectId);
    const agentIdsFromStats = Array.from(new Set(projectStats.map(stat => stat.agentId)));
    
    // Get agents that have statistics for this project
    const agentsFromStats = agentIdsFromStats.map(agentId => {
      const stat = projectStats.find(s => s.agentId === agentId);
      return {
        id: agentId,
        name: stat?.agentName || 'Unknown'
      };
    });

    // If no agents found from statistics, show all available agents
    // This ensures agents are visible even if they don't have statistics yet
    if (agentsFromStats.length === 0) {
      return (agents as any[]).map((agent: any) => ({
        id: agent.id,
        name: agent.name
      }));
    }

    return agentsFromStats;
  };

  // Get color for performance value
  const getPerfColor = (perf: number) => {
    if (perf >= 100) return 'text-green-600 dark:text-green-400';
    if (perf >= 80) return 'text-yellow-600 dark:text-yellow-400';
    if (perf >= 50) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Get background color for performance badge
  const getPerfBgColor = (perf: number) => {
    if (perf >= 100) return 'bg-green-100 dark:bg-green-900/30';
    if (perf >= 80) return 'bg-yellow-100 dark:bg-yellow-900/30';
    if (perf >= 50) return 'bg-orange-100 dark:bg-orange-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  const toggleProjectExpansion = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  // Calculate daily values for a specific agent and day
  const getDayValue = (projectId: string, agentId: string, date: Date) => {
    // This would be filled with actual data from statistics
    // For now returning placeholder
    const dayStats = statistics.filter(stat => {
      if (stat.projectId !== projectId || stat.agentId !== agentId) return false;
      const statDate = new Date(stat.date);
      return statDate.getDate() === date.getDate() &&
             statDate.getMonth() === date.getMonth() &&
             statDate.getFullYear() === date.getFullYear();
    });
    
    if (dayStats.length > 0) {
      // Sum up all positive outcomes for the day
      const positiveOutcomes = dayStats.filter(s => 
        s.outcome === 'Termin' || 
        s.outcome === 'Termin|Infomail' || 
        s.outcome === 'Selbst gebucht'
      ).length;
      return positiveOutcomes > 0 ? positiveOutcomes : '-';
    }
    return '-';
  };

  const getSortLabel = (option: SortOption) => {
    switch (option) {
      case 'performance-desc': return 'Performance ↓';
      case 'performance-asc': return 'Performance ↑';
      case 'name-asc': return 'Name A-Z';
      case 'name-desc': return 'Name Z-A';
      default: return 'Sortieren';
    }
  };

  if (!dateFrom && !dateTo) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-lg text-muted-foreground mb-2">Bitte wählen Sie ein Datum aus</p>
          <p className="text-sm text-muted-foreground">Verwenden Sie die Datumsfelder um einen Zeitraum auszuwählen</p>
        </div>
      </div>
    );
  }

  if (selectedProjects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-lg text-muted-foreground mb-2">Bitte wählen Sie mindestens ein Projekt aus</p>
          <p className="text-sm text-muted-foreground">Verwenden Sie die Projekt-Liste in der Seitenleiste</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          {sortedProjects.length} {sortedProjects.length === 1 ? 'Projekt' : 'Projekte'}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs">
              <ArrowUpDown className="w-3 h-3 mr-2" />
              {getSortLabel(sortBy)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortBy('performance-desc')}>
              Performance ↓
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('performance-asc')}>
              Performance ↑
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name-asc')}>
              Name A-Z
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name-desc')}>
              Name Z-A
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {sortedProjects.map(project => {
        const agents = getProjectAgents(project.id);
        const sollValue = getSollValue(project.id);
        const actualTotal = 0; // This would be calculated from real data
        const perfValue = calculatePerf(actualTotal, sollValue);
        const isExpanded = expandedProjects.has(project.id);
        
        return (
          <div 
            key={project.id}
            className="bg-card rounded-lg border border-border shadow-sm hover:shadow-md transition-all duration-200"
          >
            {/* Project Header */}
            <div 
              className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => toggleProjectExpansion(project.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button className="p-1 hover:bg-accent rounded transition-colors">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <div>
                    <h3 className="font-semibold text-foreground">{project.name}</h3>
                    <div className="flex items-center space-x-4 mt-1">
                      <span className="text-sm text-muted-foreground flex items-center">
                        <Users className="w-3 h-3 mr-1" />
                        {agents.length} {agents.length === 1 ? 'Agent' : 'Agenten'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {dateColumns.length} {dateColumns.length === 1 ? 'Tag' : 'Tage'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground mb-1">Soll-Zahl</div>
                    <div className="font-semibold text-foreground flex items-center">
                      <Target className="w-4 h-4 mr-1 text-muted-foreground" />
                      {sollValue}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground mb-1">Performance</div>
                    <div className={cn(
                      "px-3 py-1 rounded-full font-bold text-sm inline-flex items-center",
                      getPerfBgColor(perfValue),
                      getPerfColor(perfValue)
                    )}>
                      <TrendingUp className="w-3 h-3 mr-1" />
                      {perfValue}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Content with Agent Details */}
            {isExpanded && (
              <div className="border-t border-border">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left text-sm font-bold text-foreground min-w-[150px] border-r border-border">
                          Agent
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-bold text-foreground min-w-[80px] bg-muted/50 border-r border-border">
                          Soll
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-bold text-foreground min-w-[80px] bg-muted/50 border-r border-border">
                          Perf.
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-bold text-foreground min-w-[80px] bg-muted/50 border-r border-border">
                          <span className="flex items-center justify-center">
                            <TrendingUp className="w-5 h-5" />
                          </span>
                        </th>
                        {dateColumns.map(col => (
                          <th 
                            key={`${col.date.toISOString()}`}
                            className={cn(
                              "px-2 py-3 text-center text-sm font-medium min-w-[50px]",
                              col.isWeekend 
                                ? "bg-gray-100 dark:bg-gray-800 text-gray-500" 
                                : "text-muted-foreground"
                            )}
                          >
                            <div className="text-xs">{col.day}</div>
                            {col.isWeekend && (
                              <div className="text-[10px] opacity-60">WE</div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((agent: any, index: number) => {
                        const agentActual = 0; // Calculate from real data
                        const agentPerf = calculatePerf(agentActual, sollValue);
                        
                        return (
                          <tr 
                            key={agent.id}
                            className={cn(
                              "border-b border-border hover:bg-accent/30 transition-colors",
                              index % 2 === 0 ? "bg-background" : "bg-muted/10"
                            )}
                          >
                            <td className="sticky left-0 z-10 bg-inherit px-4 py-3 text-sm font-semibold border-r border-border bg-muted/20">
                              {agent.name}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-semibold bg-muted/20 border-r border-border">
                              {sollValue}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-bold bg-muted/20 border-r border-border">
                              {agentActual}
                            </td>
                            <td className="px-4 py-3 text-center bg-muted/20 border-r border-border">
                              <span className={cn(
                                "px-2 py-1 rounded text-xs font-bold",
                                getPerfBgColor(agentPerf),
                                getPerfColor(agentPerf)
                              )}>
                                {agentPerf}%
                              </span>
                            </td>
                            {dateColumns.map(col => (
                              <td 
                                key={`${agent.id}-${col.date.toISOString()}`}
                                className={cn(
                                  "px-2 py-3 text-center text-sm",
                                  col.isWeekend 
                                    ? "bg-gray-100 dark:bg-gray-800 text-gray-500" 
                                    : ""
                                )}
                              >
                                {getDayValue(project.id, agent.id, col.date)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                      
                      {/* Summary Row */}
                      <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold border-t-2 border-blue-300 dark:border-blue-700">
                        <td className="sticky left-0 z-10 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm font-bold text-foreground border-r border-blue-300 dark:border-blue-700">
                          Gesamt
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-foreground bg-blue-50 dark:bg-blue-900/20 border-r border-blue-300 dark:border-blue-700">
                          {sollValue * agents.length}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-foreground bg-blue-50 dark:bg-blue-900/20 border-r border-blue-300 dark:border-blue-700">
                          {actualTotal}
                        </td>
                        <td className="px-4 py-3 text-center bg-blue-50 dark:bg-blue-900/20 border-r border-blue-300 dark:border-blue-700">
                          <span className={cn(
                            "px-2 py-1 rounded text-xs font-bold",
                            getPerfBgColor(perfValue),
                            getPerfColor(perfValue)
                          )}>
                            {perfValue}%
                          </span>
                        </td>
                        {dateColumns.map(col => (
                          <td 
                            key={`total-${col.date.toISOString()}`}
                            className={cn(
                              "px-2 py-3 text-center text-sm",
                              col.isWeekend 
                                ? "bg-gray-100 dark:bg-gray-800 text-gray-500" 
                                : ""
                            )}
                          >
                            -
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}