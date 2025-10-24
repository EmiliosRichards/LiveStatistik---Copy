import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { statisticsFilterSchema } from "@shared/schema";
import { z } from "zod";
import { transcriptionService } from "./transcription-service";

// Helper function to fetch campaign mapping from Dialfire API
async function fetchCampaignMapping(): Promise<Record<string, string>> {
  try {
    const token = process.env.DIALFIRE_API_TOKEN;
    if (!token) {
      console.warn('⚠️ No DIALFIRE_API_TOKEN set');
      return {};
    }
    const tenantId = "9c6d0163";
    const url = `https://api.dialfire.com/v2/${tenantId}/campaigns`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      console.error(`Dialfire API error: ${response.status}`);
      return {};
    }
    const data = await response.json() as Array<{ id: string; title: string }>;
    const mapping: Record<string, string> = {};
    data.forEach((camp: { id: string; title: string }) => {
      mapping[camp.id] = camp.title;
    });
    console.log(`📋 Fetched ${Object.keys(mapping).length} campaigns from Dialfire`);
    return mapping;
  } catch (error) {
    console.error('Failed to fetch campaign mapping:', error);
    return {};
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all agents
  app.get("/api/agents", async (req, res) => {
    try {
      const agents = await storage.getAllAgents();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  });

  // Update agent status
  app.patch("/api/agents/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      await storage.updateAgentStatus(id, status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to update agent status" });
    }
  });

  // Get all projects with resolved campaign names
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getAllProjects();
      
      // Fetch campaign mapping to resolve IDs to names
      const campaignMapping = await fetchCampaignMapping();
      // Optionally merge sheet status
      let statusById: Record<string, string> = {};
      let statusByTitle: Record<string, string> = {};
      if (process.env.GOOGLE_SHEETS_ID) {
        const { getSheetCampaignsFull } = await import('./google-sheets');
        const rows = await getSheetCampaignsFull();
        statusById = Object.fromEntries(rows.map(r => [r.campaign_id, r.status || '']));
        statusByTitle = Object.fromEntries(rows.map(r => [r.campaign, r.status || '']));
      }
      const normalizeTitle = (s?: string) => (s || '').toLowerCase().replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
      const statusByNormTitle: Record<string, string> = {};
      Object.entries(statusByTitle).forEach(([title, st]) => { statusByNormTitle[normalizeTitle(title)] = st; });
      
      // Enhance projects with resolved names
      const enhancedProjects = projects.map(project => {
        const resolvedName = campaignMapping[project.name] || project.name;
        let status = statusById[project.name];
        if (!status && resolvedName) status = statusByTitle[resolvedName];
        if (!status && resolvedName) status = statusByNormTitle[normalizeTitle(resolvedName)];
        // Only log if we actually resolved something
        if (campaignMapping[project.name] && project.name !== resolvedName) {
          console.log(`🔍 Resolved: ${project.name} → ${resolvedName}`);
        }
        
        return {
          ...project,
          name: resolvedName,
          originalId: project.name !== resolvedName ? project.name : undefined,
          status: status || undefined
        };
      });
      
      res.json(enhancedProjects);
    } catch (error) {
      console.error('Error fetching projects with campaign mapping:', error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // Get projects for specific agents with resolved campaign names
  app.post("/api/projects-for-agents", async (req, res) => {
    try {
      const { agentIds } = req.body;
      
      if (!agentIds || agentIds.length === 0) {
        // If no agents selected, return empty array
        res.json([]);
        return;
      }
      
      const projects = await storage.getProjectsForAgents(agentIds);
      
      // Fetch campaign mapping to resolve IDs to names
      const campaignMapping = await fetchCampaignMapping();
      // Optionally merge sheet status
      let statusById: Record<string, string> = {};
      if (process.env.GOOGLE_SHEETS_ID) {
        const { getSheetCampaignsFull } = await import('./google-sheets');
        const rows = await getSheetCampaignsFull();
        statusById = Object.fromEntries(rows.map(r => [r.campaign_id, r.status || '']));
      }
      const normalizeTitle = (s?: string) => (s || '').toLowerCase().replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
      
      // Enhance projects with resolved names
      const enhancedProjects = projects.map(project => {
        const resolvedName = campaignMapping[project.name] || project.name;
        const status = statusById[project.name] || statusById[resolvedName] || statusById[normalizeTitle(resolvedName)];
        return {
          ...project,
          name: resolvedName,
          originalId: project.name !== resolvedName ? project.name : undefined,
          status: status || undefined
        };
      });
      
      res.json(enhancedProjects);
    } catch (error) {
      console.error('Error fetching projects for agents:', error);
      res.status(500).json({ message: "Failed to fetch projects for agents" });
    }
  });

  // Get projects with calls for specific agents and date range
  app.post("/api/projects-with-calls", async (req, res) => {
    try {
      const projectsWithCallsSchema = z.object({
        agentIds: z.array(z.string()).min(1, "At least one agent must be selected"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        timeFrom: z.string().optional(),
        timeTo: z.string().optional()
      });

      const filter = projectsWithCallsSchema.parse(req.body);
      const projectIds = await storage.getProjectsWithCalls(filter);
      
      console.log(`🎯 /api/projects-with-calls: Found ${projectIds.length} projects with calls for filter:`, filter);
      res.json(projectIds);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid request data", errors: error.errors });
      } else {
        console.error("❌ Error in /api/projects-with-calls:", error);
        res.status(500).json({ message: "Failed to fetch projects with calls" });
      }
    }
  });

  // Get call outcomes
  app.get("/api/call-outcomes", async (req, res) => {
    try {
      const outcomes = await storage.getAllCallOutcomes();
      res.json(outcomes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch call outcomes" });
    }
  });

  // Get KPIs with intelligent week-over-week comparisons (optimized with DB aggregation + caching)
  app.get("/api/kpis", async (req, res) => {
    try {
      console.log(`📊 KPI API: Fetching aggregated KPI data`);
      
      const refresh = req.query.refresh === 'true';
      const kpiData = await storage.getAggregatedKpisWithCache(refresh);
      
      if (kpiData.length === 0) {
        console.log('⚠️ No KPI data available');
        return res.json({
          totalCalls: { value: 0, comparison: 0, trend: 'neutral' },
          reachRate: { value: 0, comparison: 0, trend: 'neutral' },
          positiveOutcomes: { value: 0, comparison: 0, trend: 'neutral' },
          avgDuration: { value: 0, comparison: 0, trend: 'neutral' },
          metadata: { message: 'No data available' }
        });
      }
      
      const formatDate = (date: Date) => date.toISOString().split('T')[0];
      const now = new Date();
      
      const getCurrentWeekStart = () => {
        const d = new Date(now);
        const dayOfWeek = d.getDay();
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        d.setDate(d.getDate() + daysToMonday);
        return formatDate(d);
      };
      
      const currentWeekStart = getCurrentWeekStart();
      
      const sortedByDate = [...kpiData].sort((a, b) => 
        new Date(b.week_start).getTime() - new Date(a.week_start).getTime()
      );
      
      let thisWeekData = kpiData.find(d => d.week_start === currentWeekStart);
      let lastWeekData: typeof thisWeekData | undefined;
      let isUsingFallback = false;
      
      if (!thisWeekData && sortedByDate.length > 0) {
        console.log(`⚠️ No data for current week (${currentWeekStart}), falling back to most recent week`);
        thisWeekData = sortedByDate[0];
        lastWeekData = sortedByDate[1];
        isUsingFallback = true;
      } else if (thisWeekData) {
        lastWeekData = kpiData.find(d => d.week_start !== currentWeekStart);
      }
      
      console.log(`📊 This week (${currentWeekStart}):`, thisWeekData);
      console.log(`📊 Last week:`, lastWeekData);
      console.log(`📊 Using fallback:`, isUsingFallback);
      
      if (!thisWeekData) {
        console.log('⚠️ No KPI data available at all');
        return res.json({
          totalCalls: { value: 0, comparison: 0, trend: 'neutral' },
          reachRate: { value: 0, comparison: 0, trend: 'neutral' },
          positiveOutcomes: { value: 0, comparison: 0, trend: 'neutral' },
          avgDuration: { value: 0, comparison: 0, trend: 'neutral' },
          metadata: { message: 'No data available' }
        });
      }
      
      const dayOfWeek = now.getDay();
      const businessDaysElapsed = dayOfWeek === 0 ? 0 : (dayOfWeek === 6 ? 5 : dayOfWeek);
      const projectionFactor = businessDaysElapsed > 0 ? 5 / businessDaysElapsed : 1;
      
      const thisWeekCalls = thisWeekData.total_calls;
      const thisWeekReached = thisWeekData.calls_reached;
      const thisWeekPositive = thisWeekData.positive_outcomes;
      const thisWeekDuration = thisWeekData.avg_call_duration_sec;
      
      const thisWeekReachRate = thisWeekCalls > 0 ? (thisWeekReached / thisWeekCalls) * 100 : 0;
      
      const projectedWeekCalls = Math.round(thisWeekCalls * projectionFactor);
      const projectedWeekPositive = Math.round(thisWeekPositive * projectionFactor);
      
      let callsComparison = 0;
      let reachRateComparison = 0;
      let positiveComparison = 0;
      let durationComparison = 0;
      
      if (lastWeekData) {
        const lastWeekCalls = lastWeekData.total_calls;
        const lastWeekReached = lastWeekData.calls_reached;
        const lastWeekPositive = lastWeekData.positive_outcomes;
        const lastWeekDuration = lastWeekData.avg_call_duration_sec;
        const lastWeekReachRate = lastWeekCalls > 0 ? (lastWeekReached / lastWeekCalls) * 100 : 0;
        
        callsComparison = lastWeekCalls > 0 ? ((projectedWeekCalls - lastWeekCalls) / lastWeekCalls) * 100 : 0;
        reachRateComparison = lastWeekReachRate > 0 ? ((thisWeekReachRate - lastWeekReachRate) / lastWeekReachRate) * 100 : 0;
        positiveComparison = lastWeekPositive > 0 ? ((projectedWeekPositive - lastWeekPositive) / lastWeekPositive) * 100 : 0;
        durationComparison = lastWeekDuration > 0 ? ((thisWeekDuration - lastWeekDuration) / lastWeekDuration) * 100 : 0;
      }
      
      console.log(`📊 This week: ${thisWeekCalls} calls (projected: ${projectedWeekCalls}), ${thisWeekPositive} positive`);
      console.log(`📈 Week-over-week: calls ${callsComparison.toFixed(1)}%, positive ${positiveComparison.toFixed(1)}%`);
      
      res.json({
        totalCalls: {
          value: thisWeekCalls,
          comparison: parseFloat(callsComparison.toFixed(1)),
          trend: callsComparison >= 0 ? 'up' : 'down'
        },
        reachRate: {
          value: parseFloat(thisWeekReachRate.toFixed(1)),
          comparison: parseFloat(reachRateComparison.toFixed(1)),
          trend: reachRateComparison >= 0 ? 'up' : 'down'
        },
        positiveOutcomes: {
          value: thisWeekPositive,
          comparison: parseFloat(positiveComparison.toFixed(1)),
          trend: positiveComparison >= 0 ? 'up' : 'down'
        },
        avgDuration: {
          value: parseFloat((thisWeekDuration / 60).toFixed(1)),
          comparison: parseFloat(durationComparison.toFixed(1)),
          trend: durationComparison >= 0 ? 'up' : 'down'
        },
        metadata: {
          currentWeekStart,
          actualWeekStart: thisWeekData.week_start,
          usingFallbackData: isUsingFallback,
          businessDaysElapsed,
          projectedWeekCalls,
          projectedWeekPositive,
          cacheUsed: !refresh
        }
      });
    } catch (error) {
      console.error('❌ KPI API error:', error);
      res.status(500).json({ message: "Failed to fetch KPIs" });
    }
  });

  // Get agent statistics with filters
  // Simple in-memory cache for statistics to speed up repeated queries
  const statsCache = new Map<string, { ts: number; data: any }>();
  const STATS_TTL_MS = 30_000; // 30s

  app.post("/api/statistics", async (req, res) => {
    try {
      const { _cacheBust, ...filterData } = req.body; // Remove cache buster
      
      // Clean up "undefined" strings that come from frontend
      const cleanedFilterData = { ...filterData };
      if (cleanedFilterData.timeFrom === "undefined") cleanedFilterData.timeFrom = undefined;
      if (cleanedFilterData.timeTo === "undefined") cleanedFilterData.timeTo = undefined;
      if (cleanedFilterData.dateFrom === "undefined") cleanedFilterData.dateFrom = undefined;
      if (cleanedFilterData.dateTo === "undefined") cleanedFilterData.dateTo = undefined;
      
      const filter = statisticsFilterSchema.parse(cleanedFilterData);
      console.log(`📊 STATISTICS API CALLED with:`, filter);
      if (_cacheBust) {
        console.log(`🚫 CACHE BUST: Request forced with timestamp ${_cacheBust}`);
      }
      if (filter.timeFrom || filter.timeTo) {
        console.log(`🕐 STATISTICS API: Time filters active - timeFrom=${filter.timeFrom}, timeTo=${filter.timeTo}`);
      } else {
        console.log(`✅ STATISTICS API: No time filters (loading all data)`);
      }

      // Build cache key from filter
      const cacheKey = JSON.stringify(filter);
      const now = Date.now();
      const cached = statsCache.get(cacheKey);
      if (!process.env.DISABLE_STATS_CACHE && cached && (now - cached.ts) < STATS_TTL_MS) {
        console.log(`⚡ Serving statistics from cache`);
        return res.json(cached.data);
      }

      const statistics = await storage.getAgentStatistics(filter);
      if (!process.env.DISABLE_STATS_CACHE) {
        statsCache.set(cacheKey, { ts: now, data: statistics });
      }
      console.log(`📊 STATISTICS API: Returning ${statistics.length} statistics`);
      res.json(statistics);
    } catch (error) {
      console.error('Statistics API error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid filter parameters", errors: error.errors });
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message: "Failed to fetch statistics", error: errorMessage });
      }
    }
  });

  // Get call details for specific agent and project - Hardened with UUID validation
  const uuidRegex = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  
  app.get(`/api/call-details/:agentId(${uuidRegex})/:projectId(${uuidRegex})`, async (req, res) => {
    try {
      // Validate UUID parameters
      const paramsSchema = z.object({
        agentId: z.string().uuid("Invalid agent ID format"),
        projectId: z.string().uuid("Invalid project ID format")
      });
      
      const { agentId, projectId } = paramsSchema.parse(req.params);
      const { dateFrom, dateTo, timeFrom, timeTo } = req.query;
      
      console.log(`🔍 Call Details API: agentId=${agentId}, projectId=${projectId}`);
      console.log(`⏰ Time filters received: timeFrom=${timeFrom}, timeTo=${timeTo}`);
      
      const details = await storage.getCallDetails(
        agentId, 
        projectId,
        dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo ? new Date(dateTo as string) : undefined,
        timeFrom as string,
        timeTo as string
      );
      
      res.json(details);
    } catch (error) {
      console.error("Error fetching call details:", error);
      res.status(500).json({ message: "Failed to fetch call details" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
