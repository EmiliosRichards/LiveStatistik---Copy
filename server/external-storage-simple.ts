// SIMPLE PERFORMANCE OPTIMIZATIONS for ExternalStorage
// This file contains the optimized functions that can be used to replace the problematic ones

import { 
  type StatisticsFilter,
  type AgentStatistics
} from "@shared/schema";
import { randomUUID } from "crypto";
import { 
  externalPool, 
  type AgentData
} from "./external-db";

// SIMPLE OPTIMIZED VERSION - replaces the broken nested loop implementation
export async function getOptimizedAgentStatistics(
  agents: Map<string, any>,
  projects: Map<string, any>,
  filter: StatisticsFilter
): Promise<AgentStatistics[]> {
  try {
    // If no specific agents selected, return empty array
    if (!filter.agentIds || filter.agentIds.length === 0) {
      return [];
    }

    // Build date range for external query
    let dateFrom: string | undefined;
    let dateTo: string | undefined;

    console.log(`📊 SIMPLE OPTIMIZED: Processing filter for ${filter.agentIds.length} agents`);
    
    if (filter.date) {
      dateFrom = filter.date;
      dateTo = filter.date;
      console.log(`📅 Using single date filter: ${filter.date}`);
    } else {
      if (filter.dateFrom) {
        dateFrom = filter.dateFrom;
        console.log(`📅 DateFrom filter: ${filter.dateFrom}`);
        
        if (!filter.dateTo || filter.dateTo.trim() === '') {
          dateTo = filter.dateFrom;
          console.log(`📅 Single day filter: Using ${filter.dateFrom} for both dates`);
        }
      }
      if (filter.dateTo && filter.dateTo.trim() !== '') {
        dateTo = filter.dateTo;
        console.log(`📅 DateTo filter: ${filter.dateTo}`);
      }
    }

    // PERFORMANCE IMPROVEMENT: Get agent and project names
    const agentNames = filter.agentIds.map(id => agents.get(id)?.name).filter(Boolean);
    const projectNames = filter.projectIds ? filter.projectIds.map(id => projects.get(id)?.name).filter(Boolean) : undefined;

    if (agentNames.length === 0) {
      return [];
    }

    // PERFORMANCE IMPROVEMENT: Single optimized query instead of nested loops
    try {
      console.log(`🚀 SIMPLE OPTIMIZED: Making SINGLE DB query with dateFrom=${dateFrom}, dateTo=${dateTo}`);
      const externalData = await getOptimizedAgentDataQuery(agentNames, projectNames, dateFrom, dateTo, filter.timeFrom, filter.timeTo);
      console.log(`🚀 SIMPLE OPTIMIZED: Received ${externalData.length} pre-filtered records from single DB query`);
      
      // Convert external data to statistics format
      const allStats = convertDataToStatistics(externalData, agents, projects, filter);
      
      console.log(`📊 SIMPLE OPTIMIZED: Generated ${allStats.length} statistics from optimized query`);
      return allStats;
      
    } catch (error) {
      console.error('❌ SIMPLE OPTIMIZED: Error in optimized statistics query:', error);
      return [];
    }
  } catch (error) {
    console.error('❌ SIMPLE OPTIMIZED: Error in getOptimizedAgentStatistics:', error);
    return [];
  }
}

// PERFORMANCE: Optimized single DB query
async function getOptimizedAgentDataQuery(
  agentNames: string[],
  projectNames?: string[],
  dateFrom?: string,
  dateTo?: string,
  timeFrom?: string,
  timeTo?: string
): Promise<AgentData[]> {
  const client = await externalPool.connect();
  try {
    const conditions = [];
    const params: any[] = [];
    
    // Agent filter with IN clause
    if (agentNames.length > 0) {
      conditions.push(`transactions_user_login = ANY($${params.length + 1})`);
      params.push(agentNames);
    }
    
    // Project filter with IN clause (if specified)
    if (projectNames && projectNames.length > 0) {
      conditions.push(`contacts_campaign_id = ANY($${params.length + 1})`);
      params.push(projectNames);
    }
    
    // Date range filter
    if (dateFrom && dateTo) {
      conditions.push(`transactions_fired_date >= $${params.length + 1}`);
      conditions.push(`transactions_fired_date <= $${params.length + 2}`);
      params.push(dateFrom, dateTo);
    } else if (dateFrom) {
      conditions.push(`transactions_fired_date >= $${params.length + 1}`);
      params.push(dateFrom);
    } else if (dateTo) {
      conditions.push(`transactions_fired_date <= $${params.length + 1}`);
      params.push(dateTo);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Use DISTINCT ON for deduplication with performance limit
    const query = `
      SELECT DISTINCT ON (transaction_id) *
      FROM agent_data 
      ${whereClause}
      ORDER BY transaction_id, recordings_started DESC NULLS LAST, connections_duration DESC NULLS LAST
      LIMIT 5000
    `;
    
    console.log(`🚀 DB OPTIMIZED: Executing query for ${agentNames.length} agents, ${projectNames?.length || 'ALL'} projects, LIMIT 5000`);
    const result = await client.query(query, params);
    
    console.log(`🚀 DB OPTIMIZED: Found ${result.rows.length} records in single query`);
    return result.rows;
    
  } finally {
    client.release();
  }
}

// Convert external data to statistics format
function convertDataToStatistics(
  externalData: AgentData[],
  agents: Map<string, any>,
  projects: Map<string, any>,
  filter: StatisticsFilter
): AgentStatistics[] {
  const statsMap = new Map<string, AgentStatistics>();
  
  // PERFORMANCE: Build O(1) lookup maps to avoid O(n²) searches
  const agentNameToAgent = new Map<string, any>();
  const projectNameToProject = new Map<string, any>();
  
  for (const agent of agents.values()) {
    agentNameToAgent.set(agent.name, agent);
  }
  for (const project of projects.values()) {
    projectNameToProject.set(project.name, project);
  }

  externalData.forEach(record => {
    // PERFORMANCE: O(1) lookups instead of O(n) searches
    const agent = agentNameToAgent.get(record.transactions_user_login);
    const project = projectNameToProject.get(record.contacts_campaign_id);
    
    if (!agent || !project) return;

    // Apply time filtering - exclude records without time if time filter is active
    let includeRecord = true;
    if (filter.timeFrom || filter.timeTo) {
      const startTime = record.recordings_start_time;
      if (!startTime) {
        // CORRECTNESS: Exclude records without start time when time filter is active
        return;
      }
      
      const timePart = startTime.split(' ')[1]?.substring(0, 5);
      if (timePart) {
        const [hours, minutes] = timePart.split(':').map(Number);
        const cyprusHours = (hours + 3) % 24;
        const cyprusTime = `${cyprusHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        const timeFromMatch = !filter.timeFrom || cyprusTime >= filter.timeFrom;
        const timeToMatch = !filter.timeTo || cyprusTime <= filter.timeTo;
        includeRecord = timeFromMatch && timeToMatch;
      } else {
        // Exclude if we can't parse time
        return;
      }
    }

    if (!includeRecord) return;

    const dateKey = `${agent.id}-${project.id}-${record.transactions_fired_date}`;
    
    if (!statsMap.has(dateKey)) {
      statsMap.set(dateKey, {
        id: randomUUID(),
        agentId: agent.id,
        projectId: project.id,
        date: new Date(record.transactions_fired_date),
        anzahl: 0,
        abgeschlossen: 0,
        erfolgreich: 0,
        wartezeit: 0,
        gespraechszeit: 0,
        nachbearbeitungszeit: 0,
        vorbereitungszeit: 0,
        erfolgProStunde: 0,
        arbeitszeit: 0,
        outcomes: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const stat = statsMap.get(dateKey)!;
    stat.anzahl++;
    
    // Count outcomes
    const outcome = record.transactions_status_detail || '$none';
    stat.outcomes[outcome] = (stat.outcomes[outcome] || 0) + 1;
    
    // Add timing data - TEST: Try treating connections_duration as SECONDS, convert to hours
    if (record.connections_duration) {
      // TEST: Assume connections_duration is in SECONDS -> convert to hours
      const durationHours = record.connections_duration / 3600; // seconds -> hours
      stat.gespraechszeit += durationHours;
      
      // Debug: Log first few records to compare SECONDS vs MILLISECONDS interpretation
      if (stat.anzahl <= 5) {
        const asSeconds = record.connections_duration; // treat as seconds
        const asMs = record.connections_duration; // same value, but treat as ms
        
        const minutesFromSeconds = Math.floor(asSeconds / 60);
        const remainingSeconds = Math.round(asSeconds % 60);
        
        const minutesFromMs = Math.floor(asMs / 1000 / 60);
        const remainingSecondsFromMs = Math.round((asMs / 1000) % 60);
        
        console.log(`🔍 TEST ${record.connections_duration}: AS SECONDS = ${minutesFromSeconds}:${remainingSeconds.toString().padStart(2, '0')} (${durationHours.toFixed(4)}h) | AS MS = ${minutesFromMs}:${remainingSecondsFromMs.toString().padStart(2, '0')}`);
      }
    }
    
    // Determine if successful
    const status = record.transactions_status;
    if (status === 'success') {
      stat.erfolgreich++;
      stat.abgeschlossen++;
    } else if (status === 'declined') {
      stat.abgeschlossen++;
    }
  });

  return Array.from(statsMap.values());
}