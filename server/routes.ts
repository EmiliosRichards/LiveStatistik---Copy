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
  // Health/status endpoints for overview page
  app.get("/api/database-status", async (_req, res) => {
    try {
      if (!storage) {
        return res.json({ connected: false, error: "Storage not available" });
      }
      // Prefer externalPool if available
      try {
        const { externalPool } = await import("./external-db");
        if (!externalPool) {
          return res.json({ connected: false, error: "External DB not configured" });
        }
        const client = await externalPool.connect();
        try {
          await client.query("SELECT 1");
          return res.json({ connected: true });
        } finally {
          client.release();
        }
      } catch (e: any) {
        return res.json({ connected: false, error: e?.message || "DB connection failed" });
      }
    } catch (error: any) {
      res.json({ connected: false, error: error?.message || "Unknown error" });
    }
  });

  app.get("/api/dialfire-status", async (_req, res) => {
    try {
      const token = process.env.DIALFIRE_API_TOKEN;
      if (!token) {
        return res.json({ connected: false, error: "DIALFIRE_API_TOKEN not set" });
      }
      const mapping = await fetchCampaignMapping();
      const count = Object.keys(mapping).length;
      if (count > 0) {
        return res.json({ connected: true, campaigns: count });
      } else {
        return res.json({ connected: false, error: "No campaigns fetched (403 or empty)" });
      }
    } catch (e: any) {
      res.json({ connected: false, error: e?.message || "Dialfire status error" });
    }
  });

  app.get("/api/campaign-mapping", async (_req, res) => {
    try {
      // Prefer Dialfire mapping; fall back to Google Sheets if available
      const dialfire = await fetchCampaignMapping();
      let sheets: Record<string, string> = {};
      if (process.env.GOOGLE_SHEETS_ID) {
        try {
          const { getSheetCampaignMapping } = await import('./google-sheets');
          sheets = await getSheetCampaignMapping();
        } catch (e) {
          console.warn('⚠️ Failed to load sheet campaign mapping:', e);
        }
      }

      // Combine: sheets provides fallback, Dialfire overrides if present
      const mapping: Record<string, string> = { ...sheets, ...dialfire };
      const rows = Object.entries(mapping).map(([campaign_id, campaign]) => ({ campaign_id, campaign }));
      const status = rows.length > 0 ? "success" : "empty";
      res.json({ status, rows });
    } catch (e: any) {
      res.json({ status: "error", error: e?.message || "Failed to load mapping" });
    }
  });
  // Get all agents
  app.get("/api/agents", async (req, res) => {
    try {
      const agents = await storage.getAllAgents();
      res.setHeader('Cache-Control', 'public, max-age=10');
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
      const dialfireMapping = await fetchCampaignMapping();
      // Optionally merge sheet status and name fallback
      let statusById: Record<string, string> = {};
      let statusByTitle: Record<string, string> = {};
      let sheetNameById: Record<string, string> = {};
      if (process.env.GOOGLE_SHEETS_ID) {
        const { getSheetCampaignsFull, getSheetCampaignMapping } = await import('./google-sheets');
        const rows = await getSheetCampaignsFull();
        statusById = Object.fromEntries(rows.map(r => [r.campaign_id, r.status || '']));
        statusByTitle = Object.fromEntries(rows.map(r => [r.campaign, r.status || '']));
        try {
          sheetNameById = await getSheetCampaignMapping();
        } catch (e) {
          console.warn('⚠️ Failed to fetch sheet name mapping:', e);
        }
      }
      const normalizeTitle = (s?: string) => (s || '').toLowerCase().replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
      const statusByNormTitle: Record<string, string> = {};
      Object.entries(statusByTitle).forEach(([title, st]) => { statusByNormTitle[normalizeTitle(title)] = st; });
      
      // Enhance projects with resolved names
      const enhancedProjects = projects.map(project => {
        const resolvedName = dialfireMapping[project.name] || sheetNameById[project.name] || project.name;
        let status = statusById[project.name];
        if (!status && resolvedName) status = statusByTitle[resolvedName];
        if (!status && resolvedName) status = statusByNormTitle[normalizeTitle(resolvedName)];
        // Only log if we actually resolved something
        if ((dialfireMapping[project.name] || sheetNameById[project.name]) && project.name !== resolvedName) {
          console.log(`🔍 Resolved: ${project.name} → ${resolvedName}`);
        }
        
        return {
          ...project,
          name: resolvedName,
          originalId: project.name !== resolvedName ? project.name : undefined,
          status: status || undefined
        };
      });
      
      res.setHeader('Cache-Control', 'public, max-age=10');
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
      const dialfireMapping = await fetchCampaignMapping();
      // Optionally merge sheet status and sheet name fallback
      let statusById: Record<string, string> = {};
      let sheetNameById: Record<string, string> = {};
      if (process.env.GOOGLE_SHEETS_ID) {
        const { getSheetCampaignsFull, getSheetCampaignMapping } = await import('./google-sheets');
        const rows = await getSheetCampaignsFull();
        statusById = Object.fromEntries(rows.map(r => [r.campaign_id, r.status || '']));
        try {
          sheetNameById = await getSheetCampaignMapping();
        } catch (e) {
          console.warn('⚠️ Failed to fetch sheet name mapping:', e);
        }
      }
      const normalizeTitle = (s?: string) => (s || '').toLowerCase().replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
      
      // Enhance projects with resolved names
      const enhancedProjects = projects.map(project => {
        const resolvedName = dialfireMapping[project.name] || sheetNameById[project.name] || project.name;
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
          value: parseFloat((thisWeekDuration / 60000).toFixed(1)),
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

  // Get monthly call trends for charts
  app.get("/api/monthly-call-trends", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const trends = await storage.getMonthlyCallTrends(year);
      res.json(trends);
    } catch (error) {
      console.error('❌ Monthly trends API error:', error);
      res.status(500).json({ message: "Failed to fetch monthly trends" });
    }
  });

  // Get outcome distribution for charts
  app.get("/api/outcome-distribution", async (req, res) => {
    try {
      const dateFrom = (req.query.dateFrom as string) || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const dateTo = (req.query.dateTo as string) || new Date().toISOString().split('T')[0];
      const distribution = await storage.getOutcomeDistribution(dateFrom, dateTo);
      res.json(distribution);
    } catch (error) {
      console.error('❌ Outcome distribution API error:', error);
      res.status(500).json({ message: "Failed to fetch outcome distribution" });
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

  // Get call details for multiple agents in a campaign - used by campaign detail page
  app.post('/api/call-details-by-project', async (req, res) => {
    try {
      const bodySchema = z.object({
        projectId: z.string().uuid("Invalid project ID format"),
        agentIds: z.array(z.string().uuid("Invalid agent ID format")).min(1, "At least one agent ID is required"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        timeFrom: z.string().optional(),
        timeTo: z.string().optional()
      });
      
      const { projectId, agentIds, dateFrom, dateTo, timeFrom, timeTo } = bodySchema.parse(req.body);
      
      console.log(`🔍 Call Details by Project API: projectId=${projectId}, ${agentIds.length} agent(s)`);
      console.log(`🗓️  Date range: ${dateFrom} to ${dateTo}`);
      console.log(`⏰ Time filters: ${timeFrom || 'start'} to ${timeTo || 'end'}`);
      
      const details = await storage.getCallDetailsForAgents(
        agentIds,
        projectId,
        dateFrom ? new Date(dateFrom) : undefined,
        dateTo ? new Date(dateTo) : undefined,
        timeFrom,
        timeTo
      );
      
      console.log(`📊 Returning ${details.length} call details for ${agentIds.length} agent(s)`);
      res.json(details);
    } catch (error) {
      console.error("Error fetching call details by project:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid request parameters", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to fetch call details" });
      }
    }
  });

  // Transcription endpoints
  app.post('/api/transcribe', async (req, res) => {
    try {
      const apiKey = process.env.TRANSCRIPTION_API_KEY;
      if (!apiKey) {
        console.error('❌ TRANSCRIPTION_API_KEY not set');
        return res.status(503).json({ 
          error: 'Transcription service not configured',
          message: 'TRANSCRIPTION_API_KEY is not set'
        });
      }

      const bodySchema = z.object({
        audioUrl: z.string().url("Invalid audio URL")
      });
      
      const { audioUrl } = bodySchema.parse(req.body);
      console.log('🎙️ Transcription request for:', audioUrl);
      
      const job = await transcriptionService.submitTranscription(audioUrl);
      console.log('📤 Sending transcription job response:', JSON.stringify(job));
      res.json(job);
    } catch (error) {
      console.error("❌ Error submitting transcription:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request", details: error.errors });
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: "Failed to submit transcription", message: errorMessage });
      }
    }
  });

  app.get('/api/transcribe/:audioFileId/status', async (req, res) => {
    try {
      const apiKey = process.env.TRANSCRIPTION_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ 
          error: 'Transcription service not configured',
          message: 'TRANSCRIPTION_API_KEY is not set'
        });
      }

      const audioFileId = parseInt(req.params.audioFileId, 10);
      if (isNaN(audioFileId)) {
        return res.status(400).json({ error: "Invalid audio file ID" });
      }

      console.log('🔍 Checking transcription status for:', audioFileId);
      const status = await transcriptionService.getTranscriptionStatus(audioFileId);
      res.json(status);
    } catch (error) {
      console.error("Error checking transcription status:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: "Failed to check transcription status", message: errorMessage });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
