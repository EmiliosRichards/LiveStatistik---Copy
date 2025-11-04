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
    const url = `https://api.dialfire.com/v2/tenants/${tenantId}/campaigns`;
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
      
      // Calculate rolling 7-day periods
      const last7DaysEnd = new Date(now);
      const last7DaysStart = new Date(now);
      last7DaysStart.setDate(now.getDate() - 6); // Today + 6 days back = 7 days
      
      const previous7DaysEnd = new Date(last7DaysStart);
      previous7DaysEnd.setDate(last7DaysStart.getDate() - 1);
      const previous7DaysStart = new Date(previous7DaysEnd);
      previous7DaysStart.setDate(previous7DaysEnd.getDate() - 6);
      
      console.log(`📊 Comparing periods:`);
      console.log(`   Last 7 days: ${formatDate(last7DaysStart)} to ${formatDate(last7DaysEnd)}`);
      console.log(`   Previous 7 days: ${formatDate(previous7DaysStart)} to ${formatDate(previous7DaysEnd)}`);
      
      // Aggregate data for each 7-day period
      // Note: kpiData has week_start (Monday), but we need to check if the week overlaps with our period
      const aggregatePeriod = (startDate: Date, endDate: Date) => {
        const start = formatDate(startDate);
        const end = formatDate(endDate);
        
        // A week starting on date X contains data from X to X+6 days
        // We include a week if it overlaps with our target period
        const periodData = kpiData.filter(d => {
          const weekStart = new Date(d.week_start);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6); // Week covers 7 days (start + 6)
          
          const targetStart = new Date(start);
          const targetEnd = new Date(end);
          
          // Check if week overlaps with target period
          return weekStart <= targetEnd && weekEnd >= targetStart;
        });
        
        console.log(`   📅 Found ${periodData.length} week(s) overlapping ${start} to ${end}:`, periodData.map(d => d.week_start));
        
        return {
          total_calls: periodData.reduce((sum, d) => sum + d.total_calls, 0),
          calls_reached: periodData.reduce((sum, d) => sum + d.calls_reached, 0),
          positive_outcomes: periodData.reduce((sum, d) => sum + d.positive_outcomes, 0),
          avg_call_duration_sec: periodData.length > 0 
            ? periodData.reduce((sum, d) => sum + d.avg_call_duration_sec, 0) / periodData.length 
            : 0
        };
      };
      
      const last7Days = aggregatePeriod(last7DaysStart, last7DaysEnd);
      const previous7Days = aggregatePeriod(previous7DaysStart, previous7DaysEnd);
      
      console.log(`📊 Last 7 days: ${last7Days.total_calls} calls, ${last7Days.positive_outcomes} positive`);
      console.log(`📊 Previous 7 days: ${previous7Days.total_calls} calls, ${previous7Days.positive_outcomes} positive`);
      
      if (last7Days.total_calls === 0 && previous7Days.total_calls === 0) {
        console.log('⚠️ No KPI data available');
        return res.json({
          totalCalls: { value: 0, comparison: 0, trend: 'neutral' },
          reachRate: { value: 0, comparison: 0, trend: 'neutral' },
          positiveOutcomes: { value: 0, comparison: 0, trend: 'neutral' },
          avgDuration: { value: 0, comparison: 0, trend: 'neutral' },
          metadata: { message: 'No data available' }
        });
      }
      
      // Calculate metrics for last 7 days
      const last7DaysReachRate = last7Days.total_calls > 0 
        ? (last7Days.calls_reached / last7Days.total_calls) * 100 
        : 0;
      
      // Calculate metrics for previous 7 days
      const previous7DaysReachRate = previous7Days.total_calls > 0 
        ? (previous7Days.calls_reached / previous7Days.total_calls) * 100 
        : 0;
      
      // Calculate percentage changes (fair comparison: 7 days vs 7 days)
      const callsComparison = previous7Days.total_calls > 0 
        ? ((last7Days.total_calls - previous7Days.total_calls) / previous7Days.total_calls) * 100 
        : 0;
      
      const reachRateComparison = previous7DaysReachRate > 0 
        ? ((last7DaysReachRate - previous7DaysReachRate) / previous7DaysReachRate) * 100 
        : 0;
      
      const positiveComparison = previous7Days.positive_outcomes > 0 
        ? ((last7Days.positive_outcomes - previous7Days.positive_outcomes) / previous7Days.positive_outcomes) * 100 
        : 0;
      
      const durationComparison = previous7Days.avg_call_duration_sec > 0 
        ? ((last7Days.avg_call_duration_sec - previous7Days.avg_call_duration_sec) / previous7Days.avg_call_duration_sec) * 100 
        : 0;
      
      console.log(`📈 7-day comparison: calls ${callsComparison.toFixed(1)}%, reach rate ${reachRateComparison.toFixed(1)}%, positive ${positiveComparison.toFixed(1)}%`);
      
      res.json({
        totalCalls: {
          value: last7Days.total_calls,
          comparison: parseFloat(callsComparison.toFixed(1)),
          trend: callsComparison >= 0 ? 'up' : 'down'
        },
        reachRate: {
          value: parseFloat(last7DaysReachRate.toFixed(1)),
          comparison: parseFloat(reachRateComparison.toFixed(1)),
          trend: reachRateComparison >= 0 ? 'up' : 'down'
        },
        positiveOutcomes: {
          value: last7Days.positive_outcomes,
          comparison: parseFloat(positiveComparison.toFixed(1)),
          trend: positiveComparison >= 0 ? 'up' : 'down'
        },
        avgDuration: {
          value: parseFloat((last7Days.avg_call_duration_sec / 60000).toFixed(1)),
          comparison: parseFloat(durationComparison.toFixed(1)),
          trend: durationComparison >= 0 ? 'up' : 'down'
        },
        metadata: {
          last7DaysStart: formatDate(last7DaysStart),
          last7DaysEnd: formatDate(last7DaysEnd),
          previous7DaysStart: formatDate(previous7DaysStart),
          previous7DaysEnd: formatDate(previous7DaysEnd),
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

  // -----------------------
  // Stats endpoints (read-only, cached)
  // -----------------------
  const shortCache = new Map<string, { ts: number; data: any }>();
  const SHORT_TTL = 60_000; // 60s TTL
  const cacheGet = (key: string) => {
    const entry = shortCache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > SHORT_TTL) { shortCache.delete(key); return undefined; }
    return entry.data;
  };
  const cacheSet = (key: string, data: any) => { shortCache.set(key, { ts: Date.now(), data }); };

  const parseRange = (req: any) => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const dateTo = (req.query.dateTo as string) || fmt(now);
    const dFrom = new Date(dateTo);
    dFrom.setDate(dFrom.getDate() - 6);
    const dateFrom = (req.query.dateFrom as string) || fmt(dFrom);
    return { dateFrom, dateTo };
  };

  // GET /api/stats/summary
  app.get('/api/stats/summary', async (req, res) => {
    try {
      const { dateFrom, dateTo } = parseRange(req);
      const key = `summary:${dateFrom}:${dateTo}`;
      const cached = cacheGet(key);
      if (cached && req.query.refresh !== 'true') return res.json(cached);

      // Reuse KPI aggregation source
      const kpis = await storage.getAggregatedKpisWithCache(false);
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      const toD = new Date(dateTo);
      const fromD = new Date(dateFrom);
      const days = Math.max(1, Math.round((toD.getTime() - fromD.getTime())/86400000) + 1);

      // Build comparison period (previous window of equal length)
      const prevEnd = new Date(fromD);
      prevEnd.setDate(fromD.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevEnd.getDate() - (days - 1));

      const overlaps = (weekStartStr: string, aStart: Date, aEnd: Date) => {
        const ws = new Date(weekStartStr);
        const we = new Date(ws); we.setDate(ws.getDate() + 6);
        return ws <= aEnd && we >= aStart;
      };

      const aggRange = (start: Date, end: Date) => {
        const set = kpis.filter(k => overlaps(k.week_start, start, end));
        const total_calls = set.reduce((s, r) => s + (r.total_calls||0), 0);
        const calls_reached = set.reduce((s, r) => s + (r.calls_reached||0), 0);
        const positive_outcomes = set.reduce((s, r) => s + (r.positive_outcomes||0), 0);
        const avg_call_duration_sec = set.length>0 ? set.reduce((s,r)=>s+(r.avg_call_duration_sec||0),0)/set.length : 0;
        return { total_calls, calls_reached, positive_outcomes, avg_call_duration_sec };
      };

      const cur = aggRange(fromD, toD);
      const prev = aggRange(prevStart, prevEnd);

      const pctDelta = (curV: number, prevV: number) => prevV>0 ? ((curV - prevV)/prevV)*100 : 0;
      const trend = (v: number) => v>=0 ? 'up' : 'down';

      const reachRateCur = cur.total_calls>0 ? (cur.calls_reached/cur.total_calls)*100 : 0;
      const reachRatePrev = prev.total_calls>0 ? (prev.calls_reached/prev.total_calls)*100 : 0;
      const avgDurMinCur = (cur.avg_call_duration_sec/60);
      const avgDurMinPrev = (prev.avg_call_duration_sec/60);
      const convCur = cur.calls_reached>0 ? (cur.positive_outcomes/cur.calls_reached)*100 : 0;
      const convPrev = prev.calls_reached>0 ? (prev.positive_outcomes/prev.calls_reached)*100 : 0;

      let payload: any = {
        totalCalls: { value: cur.total_calls, comparison: parseFloat(pctDelta(cur.total_calls, prev.total_calls).toFixed(1)), trend: trend(pctDelta(cur.total_calls, prev.total_calls)) },
        reachRate: { value: parseFloat(reachRateCur.toFixed(1)), comparison: parseFloat(pctDelta(reachRateCur, reachRatePrev).toFixed(1)), trend: trend(pctDelta(reachRateCur, reachRatePrev)) },
        positiveOutcomes: { value: cur.positive_outcomes, comparison: parseFloat(pctDelta(cur.positive_outcomes, prev.positive_outcomes).toFixed(1)), trend: trend(pctDelta(cur.positive_outcomes, prev.positive_outcomes)) },
        avgDuration: { value: parseFloat(avgDurMinCur.toFixed(1)), comparison: parseFloat(pctDelta(avgDurMinCur, avgDurMinPrev).toFixed(1)), trend: trend(pctDelta(avgDurMinCur, avgDurMinPrev)) },
        conversionRate: { value: parseFloat(convCur.toFixed(1)), comparison: parseFloat(pctDelta(convCur, convPrev).toFixed(1)), trend: trend(pctDelta(convCur, convPrev)) },
        metadata: { dateFrom: fmt(fromD), dateTo: fmt(toD), prevFrom: fmt(prevStart), prevTo: fmt(prevEnd) }
      };

      // If KPI source is empty or zeros, fallback to aggregating statistics
      const kpiEmpty = !kpis || kpis.length === 0 || (payload.totalCalls.value === 0 && payload.positiveOutcomes.value === 0);
      if (kpiEmpty) {
        try {
          const allAgents = await storage.getAllAgents();
          const agentIds = allAgents.map(a => a.id);
          const sumStats = async (start: Date, end: Date) => {
            const list: any[] = agentIds.length ? await storage.getAgentStatistics({ agentIds, dateFrom: fmt(start), dateTo: fmt(end) } as any) : [];
            const total_calls = Array.isArray(list) ? list.reduce((s, r) => s + (r.anzahl || 0), 0) : 0;
            const calls_reached = Array.isArray(list) ? list.reduce((s, r) => s + (r.abgeschlossen || 0), 0) : 0;
            const positive_outcomes = Array.isArray(list) ? list.reduce((s, r) => s + (r.erfolgreich || 0), 0) : 0;
            // External storage uses hours for gz; convert to minutes per-call average
            const gz_total_hours = Array.isArray(list) ? list.reduce((s, r) => s + (r.gespraechszeit || 0), 0) : 0;
            const avg_call_duration_min = calls_reached > 0 ? (gz_total_hours / calls_reached) * 60 : 0;
            return { total_calls, calls_reached, positive_outcomes, avg_call_duration_min };
          };
          const curAgg = await sumStats(fromD, toD);
          const prevAgg = await sumStats(prevStart, prevEnd);
          const reachCur = curAgg.total_calls > 0 ? (curAgg.calls_reached / curAgg.total_calls) * 100 : 0;
          const reachPrev = prevAgg.total_calls > 0 ? (prevAgg.calls_reached / prevAgg.total_calls) * 100 : 0;
          const convCur2 = curAgg.calls_reached > 0 ? (curAgg.positive_outcomes / curAgg.calls_reached) * 100 : 0;
          const convPrev2 = prevAgg.calls_reached > 0 ? (prevAgg.positive_outcomes / prevAgg.calls_reached) * 100 : 0;

          payload = {
            totalCalls: { value: curAgg.total_calls, comparison: parseFloat(pctDelta(curAgg.total_calls, prevAgg.total_calls).toFixed(1)), trend: trend(pctDelta(curAgg.total_calls, prevAgg.total_calls)) },
            reachRate: { value: parseFloat(reachCur.toFixed(1)), comparison: parseFloat(pctDelta(reachCur, reachPrev).toFixed(1)), trend: trend(pctDelta(reachCur, reachPrev)) },
            positiveOutcomes: { value: curAgg.positive_outcomes, comparison: parseFloat(pctDelta(curAgg.positive_outcomes, prevAgg.positive_outcomes).toFixed(1)), trend: trend(pctDelta(curAgg.positive_outcomes, prevAgg.positive_outcomes)) },
            avgDuration: { value: parseFloat(curAgg.avg_call_duration_min.toFixed(1)), comparison: parseFloat(pctDelta(curAgg.avg_call_duration_min, prevAgg.avg_call_duration_min).toFixed(1)), trend: trend(pctDelta(curAgg.avg_call_duration_min, prevAgg.avg_call_duration_min)) },
            conversionRate: { value: parseFloat(convCur2.toFixed(1)), comparison: parseFloat(pctDelta(convCur2, convPrev2).toFixed(1)), trend: trend(pctDelta(convCur2, convPrev2)) },
            metadata: { dateFrom: fmt(fromD), dateTo: fmt(toD), prevFrom: fmt(prevStart), prevTo: fmt(prevEnd), fallback: true }
          };
        } catch (e) {
          console.warn('⚠️ stats/summary fallback failed:', e);
        }
      }

      cacheSet(key, payload);
      res.json(payload);
    } catch (error) {
      console.error('❌ /api/stats/summary error:', error);
      res.status(500).json({ message: 'Failed to fetch summary' });
    }
  });

  // GET /api/stats/heatmap
  app.get('/api/stats/heatmap', async (req, res) => {
    try {
      const { dateFrom, dateTo } = parseRange(req);
      const key = `heatmap:${dateFrom}:${dateTo}`;
      const cached = cacheGet(key);
      if (cached && req.query.refresh !== 'true') return res.json(cached);

      // Load all agents and projects with calls for the period
      const allAgents = await storage.getAllAgents();
      const agentIds = allAgents.map(a => a.id);
      const projectsWithCalls = await storage.getProjectsWithCalls({ agentIds, dateFrom, dateTo });

      // Aggregate call details across all agents and relevant projects
      const detailsArrays = await Promise.all(projectsWithCalls.map(pid => 
        storage.getCallDetailsForAgents(agentIds, pid, dateFrom ? new Date(dateFrom) : undefined, dateTo ? new Date(dateTo) : undefined)
      ));
      const all = detailsArrays.flat();

      // Build weekday (0-6) × hour (0-23) aggregation in Cyprus time (+3h)
      const map: Record<string, { weekday: number; hour: number; reached: number; positive: number }> = {};
      for (const d of all) {
        if (!d.callStart) continue;
        const cyprus = new Date(new Date(d.callStart).getTime() + 3*60*60*1000);
        const weekday = cyprus.getDay();
        const hour = cyprus.getHours();
        const keyCell = `${weekday}-${hour}`;
        if (!map[keyCell]) map[keyCell] = { weekday, hour, reached: 0, positive: 0 };
        const cat = String(d.outcomeCategory || '');
        if (cat !== 'offen') map[keyCell].reached += 1;
        if (cat === 'positive') map[keyCell].positive += 1;
      }

      const data = Object.values(map)
        .sort((a,b)=> a.weekday===b.weekday ? a.hour-b.hour : a.weekday-b.weekday)
        .map(c => ({ ...c, rate: c.reached>0 ? parseFloat(((c.positive/c.reached)*100).toFixed(1)) : 0 }));
      cacheSet(key, data);
      res.json(data);
    } catch (error) {
      console.error('❌ /api/stats/heatmap error:', error);
      res.status(500).json({ message: 'Failed to fetch heatmap' });
    }
  });

  // GET /api/stats/positive-mix
  app.get('/api/stats/positive-mix', async (req, res) => {
    try {
      const { dateFrom, dateTo } = parseRange(req);
      const key = `positive-mix:${dateFrom}:${dateTo}`;
      const cached = cacheGet(key);
      if (cached && req.query.refresh !== 'true') return res.json(cached);
      const allAgents = await storage.getAllAgents();
      const agentIds = allAgents.map(a => a.id);
      const projectsWithCalls = await storage.getProjectsWithCalls({ agentIds, dateFrom, dateTo });
      const detailsArrays = await Promise.all(projectsWithCalls.map(pid => 
        storage.getCallDetailsForAgents(agentIds, pid, dateFrom ? new Date(dateFrom) : undefined, dateTo ? new Date(dateTo) : undefined)
      ));
      const all = detailsArrays.flat();
      const pos = all.filter(d => String(d.outcomeCategory||'') === 'positive');
      const totalPos = pos.length || 0;
      const counts = new Map<string, number>();
      for (const d of pos) {
        const label = d.outcome || 'Unknown';
        counts.set(label, (counts.get(label)||0)+1);
      }
      const data = Array.from(counts.entries()).map(([label,count])=>({ label, count, pctOfPositive: totalPos? parseFloat(((count/totalPos)*100).toFixed(1)) : 0 }))
        .sort((a,b)=> b.count - a.count);
      cacheSet(key, data);
      res.json(data);
    } catch (error) {
      console.error('❌ /api/stats/positive-mix error:', error);
      res.status(500).json({ message: 'Failed to fetch positive mix' });
    }
  });

  // GET /api/stats/agent-improvement
  app.get('/api/stats/agent-improvement', async (req, res) => {
    try {
      const { dateFrom, dateTo } = parseRange(req);
      const key = `agent-improvement:${dateFrom}:${dateTo}`;
      const cached = cacheGet(key);
      if (cached && req.query.refresh !== 'true') return res.json(cached);
      const allAgents = await storage.getAllAgents();
      const agentIds = allAgents.map(a => a.id);
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      const toD = new Date(dateTo); const fromD = new Date(dateFrom);
      const days = Math.max(1, Math.round((toD.getTime()-fromD.getTime())/86400000)+1);
      const prevEnd = new Date(fromD); prevEnd.setDate(fromD.getDate()-1);
      const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1));

      const listCur: any[] = agentIds.length ? await storage.getAgentStatistics({ agentIds, dateFrom, dateTo } as any) : [];
      const listPrev: any[] = agentIds.length ? await storage.getAgentStatistics({ agentIds, dateFrom: fmt(prevStart), dateTo: fmt(prevEnd) } as any) : [];

      const groupByAgent = (list: any[]) => {
        const m = new Map<string, { reached:number; positive:number }>();
        list.forEach(r => {
          const a = m.get(r.agentId) || { reached:0, positive:0 };
          a.reached += r.abgeschlossen || 0; a.positive += r.erfolgreich || 0; m.set(r.agentId, a);
        });
        return m;
      };
      const curM = groupByAgent(listCur);
      const prevM = groupByAgent(listPrev);
      const data = allAgents.map(a => {
        const cur = curM.get(a.id) || { reached:0, positive:0 };
        const prev = prevM.get(a.id) || { reached:0, positive:0 };
        const lastRate = cur.reached>0 ? (cur.positive/cur.reached)*100 : 0;
        const prevRate = prev.reached>0 ? (prev.positive/prev.reached)*100 : 0;
        return { agentId: a.id, agentName: a.name, lastRate: parseFloat(lastRate.toFixed(1)), prevRate: parseFloat(prevRate.toFixed(1)), delta: parseFloat((lastRate - prevRate).toFixed(1)) };
      }).sort((a,b)=> b.delta - a.delta);
      cacheSet(key, data);
      res.json(data);
    } catch (error) {
      console.error('❌ /api/stats/agent-improvement error:', error);
      res.status(500).json({ message: 'Failed to fetch agent improvement' });
    }
  });

  // GET /api/stats/efficiency
  app.get('/api/stats/efficiency', async (req, res) => {
    try {
      const { dateFrom, dateTo } = parseRange(req);
      const key = `efficiency:${dateFrom}:${dateTo}`;
      const cached = cacheGet(key);
      if (cached && req.query.refresh !== 'true') return res.json(cached);
      const allAgents = await storage.getAllAgents();
      const agentIds = allAgents.map(a => a.id);
      const projectsWithCalls = await storage.getProjectsWithCalls({ agentIds, dateFrom, dateTo });
      const detailsArrays = await Promise.all(projectsWithCalls.map(pid => 
        storage.getCallDetailsForAgents(agentIds, pid, dateFrom ? new Date(dateFrom) : undefined, dateTo ? new Date(dateTo) : undefined)
      ));
      const all = detailsArrays.flat();
      let posDurS = 0, posCnt = 0, othDurS = 0, othCnt = 0;
      let withNotesPos = 0, withNotesReached = 0, withoutNotesPos = 0, withoutNotesReached = 0;
      for (const d of all) {
        const sec = Math.max(0, Math.round(d.duration || 0));
        const cat = String(d.outcomeCategory || '');
        const hasNotes = !!d.notes && String(d.notes).trim() !== '';
        if (cat === 'positive') { posDurS += sec; posCnt += 1; }
        else if (cat && cat !== 'offen') { othDurS += sec; othCnt += 1; }
        if (cat && cat !== 'offen') {
          if (hasNotes) { withNotesReached += 1; if (cat === 'positive') withNotesPos += 1; }
          else { withoutNotesReached += 1; if (cat === 'positive') withoutNotesPos += 1; }
        }
      }
      const positiveMin = posCnt>0 ? (posDurS/posCnt)/60 : 0;
      const otherMin = othCnt>0 ? (othDurS/othCnt)/60 : 0;
      const withNotesRate = withNotesReached>0 ? (withNotesPos/withNotesReached)*100 : 0;
      const withoutNotesRate = withoutNotesReached>0 ? (withoutNotesPos/withoutNotesReached)*100 : 0;
      const lift = withNotesRate - withoutNotesRate;
      const data = { avgDuration: { positiveMin: parseFloat(positiveMin.toFixed(1)), otherMin: parseFloat(otherMin.toFixed(1)) }, notesEffect: { withNotesRate: parseFloat(withNotesRate.toFixed(1)), withoutNotesRate: parseFloat(withoutNotesRate.toFixed(1)), lift: parseFloat(lift.toFixed(1)) } };
      cacheSet(key, data);
      res.json(data);
    } catch (error) {
      console.error('❌ /api/stats/efficiency error:', error);
      res.status(500).json({ message: 'Failed to fetch efficiency' });
    }
  });

  // GET /api/stats/campaign-effectiveness
  app.get('/api/stats/campaign-effectiveness', async (req, res) => {
    try {
      const { dateFrom, dateTo } = parseRange(req);
      const key = `campaign-effectiveness:${dateFrom}:${dateTo}`;
      const cached = cacheGet(key);
      if (cached && req.query.refresh !== 'true') return res.json(cached);
      const allAgents = await storage.getAllAgents();
      const agentIds = allAgents.map(a => a.id);
      const stats: any[] = agentIds.length ? await storage.getAgentStatistics({ agentIds, dateFrom, dateTo } as any) : [];
      const byProject = new Map<string, { projectId: string; calls:number; reached:number; positive:number }>();
      stats.forEach(s => {
        const p = byProject.get(s.projectId) || { projectId: s.projectId, calls:0, reached:0, positive:0 };
        p.calls += s.anzahl || 0; p.reached += s.abgeschlossen || 0; p.positive += s.erfolgreich || 0; byProject.set(s.projectId, p);
      });
      const overall = Array.from(byProject.values()).reduce((acc, p)=>{ acc.reached += p.reached; acc.positive += p.positive; return acc; }, { reached:0, positive:0 });
      const overallRate = overall.reached>0 ? (overall.positive/overall.reached)*100 : 0;
      const projects = await storage.getAllProjects();
      const nameById = new Map(projects.map(p=>[p.id, p.name] as const));
      const data = Array.from(byProject.values()).map(p => {
        const rate = p.reached>0 ? (p.positive/p.reached)*100 : 0;
        return { projectId: p.projectId, projectName: nameById.get(p.projectId) || p.projectId, rate: parseFloat(rate.toFixed(1)), lift: parseFloat((rate - overallRate).toFixed(1)) };
      }).sort((a,b)=> b.lift - a.lift);
      cacheSet(key, data);
      res.json(data);
    } catch (error) {
      console.error('❌ /api/stats/campaign-effectiveness error:', error);
      res.status(500).json({ message: 'Failed to fetch campaign effectiveness' });
    }
  });

  // GET /api/stats/targets-progress
  app.get('/api/stats/targets-progress', async (req, res) => {
    try {
      const { dateFrom, dateTo } = parseRange(req);
      const key = `targets-progress:${dateFrom}:${dateTo}`;
      const cached = cacheGet(key);
      if (cached && req.query.refresh !== 'true') return res.json(cached);
      const targets = await storage.getAllProjectTargets?.()
        .catch?.(()=>[]) as any[] || [];
      if (!targets || targets.length === 0) { cacheSet(key, []); return res.json([]); }
      const allAgents = await storage.getAllAgents();
      const agentIds = allAgents.map(a => a.id);
      const stats: any[] = agentIds.length ? await storage.getAgentStatistics({ agentIds, dateFrom, dateTo } as any) : [];
      const posByProject = new Map<string, number>();
      stats.forEach(s => { posByProject.set(s.projectId, (posByProject.get(s.projectId)||0) + (s.erfolgreich || 0)); });
      const projects = await storage.getAllProjects();
      const nameById = new Map(projects.map(p=>[p.id, p.name] as const));
      const data = targets.map(t => {
        const projectId = t.projectId || t.project_id || t.id;
        const target = t.targetValue ?? t.target ?? 0;
        const actualPositives = posByProject.get(projectId) || 0;
        const pct = target>0 ? (actualPositives/target)*100 : 0;
        return { projectId, projectName: nameById.get(projectId) || projectId, target, actualPositives, pct: parseFloat(pct.toFixed(1)), projectedPct: parseFloat(pct.toFixed(1)) };
      }).sort((a,b)=> (b.pct - a.pct));
      cacheSet(key, data);
      res.json(data);
    } catch (error) {
      console.error('❌ /api/stats/targets-progress error:', error);
      res.status(500).json({ message: 'Failed to fetch targets progress' });
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

  // QM (Quality Management) endpoint
  app.get("/api/qm", async (req, res) => {
    try {
      const month = req.query.month as string | undefined;
      const sheet = req.query.sheet as string | undefined;
      
      const key = `qm:${month || 'latest'}:${sheet || 'auto'}`;
      const cached = cacheGet(key);
      if (cached && req.query.refresh !== 'true') {
        console.log(`📊 QM Cache hit: ${key}`);
        return res.json(cached);
      }

      const qmSource = process.env.QM_EXCEL_PATH || process.env.QM_EXCEL_URL;
      if (!qmSource) {
        return res.status(503).json({ 
          error: 'QM data not configured',
          message: 'Set QM_EXCEL_PATH or QM_EXCEL_URL environment variable'
        });
      }

      const { parseQmExcel } = await import('./qm-parser');
      const cookie = process.env.SHAREPOINT_COOKIE;
      
      console.log(`📊 QM: Loading data from ${qmSource.substring(0, 50)}...`);
      const rows = await parseQmExcel(qmSource, { month, sheet, cookie });
      
      console.log(`✅ QM: Loaded ${rows.length} rows from sheet`);
      cacheSet(key, rows);
      res.json(rows);
    } catch (error) {
      console.error("❌ QM Error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: "Failed to load QM data", message: errorMessage });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
