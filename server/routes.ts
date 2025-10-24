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

  // Get KPIs with intelligent month-over-month comparisons
  app.get("/api/kpis", async (req, res) => {
    try {
      console.log(`📊 KPI API: Fetching current week and month data`);
      
      const now = new Date();
      const agentList = await storage.getAllAgents();
      const allAgentIds = agentList.map(a => a.id);
      
      // Helper to format date as YYYY-MM-DD
      const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0];
      };
      
      // Get start of current week (Monday)
      const today = new Date(now);
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() + daysToMonday);
      weekStart.setHours(0, 0, 0, 0);
      
      // Get start of current month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Get start of last month
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of last month
      
      console.log(`📅 Current week: ${formatDate(weekStart)} to ${formatDate(now)}`);
      console.log(`📅 Current month: ${formatDate(monthStart)} to ${formatDate(now)}`);
      console.log(`📅 Last month: ${formatDate(lastMonthStart)} to ${formatDate(lastMonthEnd)}`);
      
      // Fetch statistics for this week
      const thisWeekStats = await storage.getAgentStatistics({
        agentIds: allAgentIds,
        dateFrom: formatDate(weekStart),
        dateTo: formatDate(now)
      });
      
      // Fetch statistics for this month
      const thisMonthStats = await storage.getAgentStatistics({
        agentIds: allAgentIds,
        dateFrom: formatDate(monthStart),
        dateTo: formatDate(now)
      });
      
      // Fetch statistics for last month
      const lastMonthStats = await storage.getAgentStatistics({
        agentIds: allAgentIds,
        dateFrom: formatDate(lastMonthStart),
        dateTo: formatDate(lastMonthEnd)
      });
      
      // Calculate KPIs for this week
      const weekCalls = thisWeekStats.reduce((sum, s) => sum + s.anzahl, 0);
      const weekSuccess = thisWeekStats.reduce((sum, s) => sum + s.erfolgreich, 0);
      const weekCompleted = thisWeekStats.reduce((sum, s) => sum + s.abgeschlossen, 0);
      const weekReachRate = weekCalls > 0 ? (weekCompleted / weekCalls) * 100 : 0;
      const weekTotalTime = thisWeekStats.reduce((sum, s) => sum + s.gespraechszeit, 0);
      const weekAvgDuration = weekCompleted > 0 ? (weekTotalTime / weekCompleted) * 60 : 0;
      
      // Calculate KPIs for this month
      const monthCalls = thisMonthStats.reduce((sum, s) => sum + s.anzahl, 0);
      const monthSuccess = thisMonthStats.reduce((sum, s) => sum + s.erfolgreich, 0);
      const monthCompleted = thisMonthStats.reduce((sum, s) => sum + s.abgeschlossen, 0);
      const monthReachRate = monthCalls > 0 ? (monthCompleted / monthCalls) * 100 : 0;
      const monthTotalTime = thisMonthStats.reduce((sum, s) => sum + s.gespraechszeit, 0);
      const monthAvgDuration = monthCompleted > 0 ? (monthTotalTime / monthCompleted) * 60 : 0;
      
      // Calculate KPIs for last month
      const lastMonthCalls = lastMonthStats.reduce((sum, s) => sum + s.anzahl, 0);
      const lastMonthSuccess = lastMonthStats.reduce((sum, s) => sum + s.erfolgreich, 0);
      const lastMonthCompleted = lastMonthStats.reduce((sum, s) => sum + s.abgeschlossen, 0);
      const lastMonthReachRate = lastMonthCalls > 0 ? (lastMonthCompleted / lastMonthCalls) * 100 : 0;
      const lastMonthTotalTime = lastMonthStats.reduce((sum, s) => sum + s.gespraechszeit, 0);
      const lastMonthAvgDuration = lastMonthCompleted > 0 ? (lastMonthTotalTime / lastMonthCompleted) * 60 : 0;
      
      // Calculate projections if we're mid-month
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysElapsedInMonth = now.getDate();
      const projectionFactor = daysInMonth / daysElapsedInMonth;
      
      const projectedMonthCalls = Math.round(monthCalls * projectionFactor);
      const projectedMonthSuccess = Math.round(monthSuccess * projectionFactor);
      
      // Calculate comparison percentages
      const callsComparison = lastMonthCalls > 0 
        ? ((projectedMonthCalls - lastMonthCalls) / lastMonthCalls) * 100 
        : 0;
      
      const successComparison = lastMonthSuccess > 0 
        ? ((projectedMonthSuccess - lastMonthSuccess) / lastMonthSuccess) * 100 
        : 0;
      
      const reachRateComparison = lastMonthReachRate > 0 
        ? ((monthReachRate - lastMonthReachRate) / lastMonthReachRate) * 100 
        : 0;
      
      const durationComparison = lastMonthAvgDuration > 0 
        ? ((monthAvgDuration - lastMonthAvgDuration) / lastMonthAvgDuration) * 100 
        : 0;
      
      console.log(`📊 This week: ${weekCalls} calls, ${weekSuccess} successful`);
      console.log(`📊 This month: ${monthCalls} calls (projected: ${projectedMonthCalls}), ${monthSuccess} successful`);
      console.log(`📊 Last month: ${lastMonthCalls} calls, ${lastMonthSuccess} successful`);
      console.log(`📈 Comparisons: calls ${callsComparison.toFixed(1)}%, success ${successComparison.toFixed(1)}%`);
      
      res.json({
        totalCalls: {
          value: weekCalls,
          comparison: parseFloat(callsComparison.toFixed(1)),
          trend: callsComparison >= 0 ? 'up' : 'down'
        },
        reachRate: {
          value: parseFloat(weekReachRate.toFixed(1)),
          comparison: parseFloat(reachRateComparison.toFixed(1)),
          trend: reachRateComparison >= 0 ? 'up' : 'down'
        },
        positiveOutcomes: {
          value: weekSuccess,
          comparison: parseFloat(successComparison.toFixed(1)),
          trend: successComparison >= 0 ? 'up' : 'down'
        },
        avgDuration: {
          value: parseFloat(weekAvgDuration.toFixed(1)),
          comparison: parseFloat(durationComparison.toFixed(1)),
          trend: durationComparison >= 0 ? 'up' : 'down'
        },
        metadata: {
          weekStart: formatDate(weekStart),
          monthStart: formatDate(monthStart),
          lastMonthStart: formatDate(lastMonthStart),
          lastMonthEnd: formatDate(lastMonthEnd),
          daysElapsedInMonth,
          daysInMonth,
          projectedMonthCalls,
          projectedMonthSuccess
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
