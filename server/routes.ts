import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { statisticsFilterSchema } from "@shared/schema";
import { z } from "zod";
import { transcriptionService } from "./transcription-service";

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
      
      // DEBUG: Log first few records to see if groupId is present
      if (details.length > 0) {
        console.log(`📤 API Response: Sending ${details.length} call details`);
        console.log(`📤 First 3 records with groupId:`, details.slice(0, 3).map(d => ({
          id: d.id,
          groupId: d.groupId,
          contactsId: d.contactsId,
          contactsCampaignId: d.contactsCampaignId,
          recordingsDate: d.recordingsDate,
          callStart: d.callStart
        })));
      }
      
      res.json(details);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.log(`❌ Invalid UUID in call details request: ${req.originalUrl}`);
        console.log(`❌ Received agentId=${req.params.agentId}, projectId=${req.params.projectId}`);
        return res.status(400).json({ 
          message: "Invalid agent or project ID format. UUIDs required.", 
          errors: error.issues 
        });
      }
      console.error("Error fetching call details:", error);
      res.status(500).json({ message: "Failed to fetch call details" });
    }
  });

  // Paged Call Details with totals and grouping
  app.get(`/api/call-details-paged/:agentId(${uuidRegex})/:projectId(${uuidRegex})`, async (req, res) => {
    try {
      const paramsSchema = z.object({
        agentId: z.string().uuid(),
        projectId: z.string().uuid()
      })
      const { agentId, projectId } = paramsSchema.parse(req.params)
      const raw = req.query as any
      const cleanStr = (v: any) => (typeof v === 'string' && (v.trim() === '' || v === 'undefined' || v === 'null')) ? undefined : v
      const dateFrom = cleanStr(raw.dateFrom)
      const dateTo = cleanStr(raw.dateTo)
      const timeFrom = cleanStr(raw.timeFrom)
      const timeTo = cleanStr(raw.timeTo)
      const page = cleanStr(raw.page) || '1'
      const pageSize = cleanStr(raw.pageSize) || '200'

      const agent = await storage.getAgent(agentId)
      const project = await storage.getProject(projectId)
      console.log(`🔎 PagedCalls params: agentId=${agentId}, projectId=${projectId}`)
      console.log(`🔎 Resolved: agentLogin=${agent?.name || 'NOT_FOUND'}, campaignId=${project?.name || 'NOT_FOUND'}`)
      if (!agent || !project) return res.json({ total: 0, grouped: { positiv:{}, negativ:{}, offen:{} }, items: [] })

      const { externalPool } = await import('./external-db')
      if (!externalPool) return res.json({ total: 0, grouped: { positiv:{}, negativ:{}, offen:{} }, items: [] })

      const client = await externalPool.connect()
      try {
        // Be robust to case/whitespace differences on agent logins
        const conditions: string[] = [ `LOWER(TRIM(transactions_user_login)) = LOWER(TRIM($1))`, `TRIM(contacts_campaign_id) = TRIM($2)` ]
        const params: any[] = [agent.name?.trim(), project.name?.trim()]
        if (dateFrom) { conditions.push(`transactions_fired_date >= $${params.length+1}`); params.push(dateFrom) }
        if (dateTo) { conditions.push(`transactions_fired_date <= $${params.length+1}`); params.push(dateTo) }

        // time filters via time derived from recordings_started (UTC), converting Cyprus(+3) to UTC
        let utcFrom: string | null = null
        let utcTo: string | null = null
        const isTime = (s: any) => typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s)
        if (isTime(timeFrom)) {
          const [h,m] = (timeFrom as string).split(':').map(Number); const uh = (h-3+24)%24; utcFrom = `${uh.toString().padStart(2,'0')}:${(m||0).toString().padStart(2,'0')}`
        }
        if (isTime(timeTo)) {
          const [h,m] = (timeTo as string).split(':').map(Number); const uh = (h-3+24)%24; utcTo = `${uh.toString().padStart(2,'0')}:${(m||0).toString().padStart(2,'0')}`
        }
        const timeExpr = `to_char(recordings_started, 'HH24:MI')`
        if (utcFrom) { conditions.push(`${timeExpr} >= $${params.length+1}`); params.push(utcFrom) }
        if (utcTo) { conditions.push(`${timeExpr} <= $${params.length+1}`); params.push(utcTo) }

        const where = `WHERE ${conditions.join(' AND ')}`

        // Use robust unique key when transaction_id is missing
        const uniqueExpr = `COALESCE(transaction_id::text, CONCAT_WS(':', contacts_id::text, contacts_campaign_id::text, transactions_fired_date::text))`
        // total count (distinct by unique expression)
        const totalRes = await client.query(`SELECT COUNT(*) AS total FROM (SELECT DISTINCT ${uniqueExpr} AS k FROM agent_data ${where}) t`, params)
        const total = Number(totalRes.rows?.[0]?.total || 0)
        console.log(`🔎 PagedCalls matched total=${total}`)

        // grouped counts by status/detail
        const groupRes = await client.query(`
          SELECT transactions_status, transactions_status_detail, COUNT(DISTINCT ${uniqueExpr}) AS cnt
          FROM agent_data
          ${where}
          GROUP BY transactions_status, transactions_status_detail
        `, params)
        const grouped = { positiv: {} as Record<string, number>, negativ: {} as Record<string, number>, offen: {} as Record<string, number> }
        groupRes.rows.forEach((r:any) => {
          const status = String(r.transactions_status||'').toLowerCase()
          const key = r.transactions_status_detail || '—'
          const n = Number(r.cnt||0)
          if (status === 'success') grouped.positiv[key] = (grouped.positiv[key]||0) + n
          else if (status === 'declined') grouped.negativ[key] = (grouped.negativ[key]||0) + n
          else grouped.offen[key] = (grouped.offen[key]||0) + n
        })

        // page items
        const p = Math.max(1, parseInt(String(page),10)||1)
        const ps = Math.max(1, parseInt(String(pageSize),10)||200)
        const offset = (p-1)*ps
        const itemsRes = await client.query(`
          SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (
              PARTITION BY ${uniqueExpr}
              ORDER BY recordings_started DESC NULLS LAST, connections_duration DESC NULLS LAST
            ) AS rn
            FROM agent_data
            ${where}
          ) t
          WHERE t.rn = 1
          ORDER BY recordings_started DESC NULLS LAST, connections_duration DESC NULLS LAST
          LIMIT $${params.length+1} OFFSET $${params.length+2}
        `, [...params, ps, offset])

        // map to CallDetails minimal; reuse mapping in external storage style
        const mapItems = itemsRes.rows.map((record:any, index:number) => ({
          id: record.transaction_id || `${record.contacts_id}_${index}`,
          agentId,
          projectId,
          contactName: record.contacts_firma || null,
          contactPerson: record.contacts_full_name || record.contacts_name || null,
          contactNumber: record.connections_phone,
          callStart: record.recordings_started ? new Date(record.recordings_started) : new Date(record.transactions_fired_date),
          callEnd: record.recordings_stopped ? new Date(record.recordings_stopped) : null,
          duration: Math.round((Number(record.connections_duration)||0)/1000),
          outcome: record.transactions_status_detail || 'Unknown',
          outcomeCategory: record.transactions_status === 'success' ? 'positive' : (record.transactions_status === 'declined' ? 'negative' : 'offen'),
          recordingUrl: record.recordings_location,
          notes: record.contacts_notiz || null,
          wrapupTimeSeconds: record.transactions_edit_time_sec || null,
          waitTimeSeconds: record.transactions_wait_time_sec || null,
          editTimeSeconds: record.transactions_pause_time_sec || null,
          contactsId: record.contacts_id || null,
          contactsCampaignId: record.contacts_campaign_id || null,
          recordingsDate: record.transactions_fired_date ? String(record.transactions_fired_date).split(' ')[0] : null,
          groupId: null,
          createdAt: new Date()
        }))

        res.json({ total, grouped, items: mapItems })
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Paged Call Details error:', error)
      res.status(500).json({ total:0, grouped:{positiv:{},negativ:{},offen:{}}, items: [] })
    }
  })

  // Get all project targets
  app.get("/api/project-targets", async (req, res) => {
    try {
      const targets = await storage.getAllProjectTargets();
      res.json(targets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project targets" });
    }
  });

  // Save project targets
  app.post("/api/project-targets", async (req, res) => {
    try {
      const targetsData = req.body;
      // Validate that we have a valid object
      if (!targetsData || typeof targetsData !== 'object') {
        return res.status(400).json({ message: "Invalid targets data" });
      }

      await storage.saveProjectTargets(targetsData);
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving project targets:', error);
      res.status(500).json({ message: "Failed to save project targets" });
    }
  });

  // Get current Cyprus time
  app.get("/api/cyprus-time", async (req, res) => {
    try {
      // Use WorldTimeAPI for Cyprus time (Europe/Nicosia timezone)
      const response = await fetch('https://worldtimeapi.org/api/timezone/Europe/Nicosia');
      
      if (!response.ok) {
        throw new Error(`WorldTimeAPI error: ${response.status}`);
      }
      
      const timeData = await response.json() as any;
      
      // Return the datetime and timezone info
      res.json({
        datetime: timeData.datetime,
        timezone: timeData.timezone,
        utc_offset: timeData.utc_offset,
        unixtime: timeData.unixtime
      });
    } catch (error) {
      console.error('Error fetching Cyprus time:', error);
      
      // Fallback: Calculate Cyprus time manually (UTC+2/+3 depending on DST)
      const now = new Date();
      const cyprusTime = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // UTC+2 as basic fallback
      
      res.json({
        datetime: cyprusTime.toISOString(),
        timezone: 'Europe/Nicosia',
        utc_offset: '+02:00',
        unixtime: Math.floor(cyprusTime.getTime() / 1000),
        fallback: true
      });
    }
  });

  // Check external database status (real connectivity test)
  app.get("/api/database-status", async (req, res) => {
    try {
      const { externalPool } = await import("./external-db");
      
      if (!externalPool) {
        return res.json({
          connected: false,
          timestamp: new Date().toISOString(),
          database: 'external',
          error: 'External database not configured'
        });
      }
      
      // Test actual connection to external database
      const client = await externalPool.connect();
      try {
        // Simple query to test connectivity
        await client.query('SELECT 1');
        
        res.json({
          connected: true,
          timestamp: new Date().toISOString(),
          database: 'external'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ External database connectivity test failed:', error);
      res.json({
        connected: false,
        timestamp: new Date().toISOString(),
        database: 'external',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Check Dialfire API status (real connectivity test)
  app.get("/api/dialfire-status", async (req, res) => {
    try {
      const token = process.env.DIALFIRE_API_TOKEN;
      
      if (!token) {
        console.log("❌ DIALFIRE_API_TOKEN not configured");
        return res.json({
          connected: false,
          timestamp: new Date().toISOString(),
          service: 'dialfire',
          error: 'API token not configured'
        });
      }

      // Test actual connection to Dialfire API
      const tenantId = "9c6d0163";
      const baseUrl = "https://api.dialfire.com/api";
      const url = `${baseUrl}/tenants/${tenantId}/campaigns/`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        console.log(`❌ Dialfire API connectivity test failed: ${response.status} ${response.statusText}`);
        
        return res.json({
          connected: false,
          timestamp: new Date().toISOString(),
          service: 'dialfire',
          error: `API returned ${response.status}: ${response.statusText}`
        });
      }

      const data = await response.json();
      
      // Verify we got valid campaign data
      if (!Array.isArray(data) || data.length === 0) {
        return res.json({
          connected: false,
          timestamp: new Date().toISOString(),
          service: 'dialfire',
          error: 'Invalid API response format'
        });
      }

      res.json({
        connected: true,
        timestamp: new Date().toISOString(),
        service: 'dialfire',
        campaigns_count: data.length
      });
      
    } catch (error) {
      console.error('❌ Dialfire API connectivity test failed:', error);
      res.json({
        connected: false,
        timestamp: new Date().toISOString(),
        service: 'dialfire',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Campaign mapping service - fetch all campaigns and create ID-to-title mapping
  let campaignCache: { [key: string]: string } = {};
  let cacheTimestamp = 0;
  const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
  
  async function fetchCampaignMapping(): Promise<{ [key: string]: string }> {
    const now = Date.now();
    
    // Return cached data if still valid
    if (now - cacheTimestamp < CACHE_DURATION && Object.keys(campaignCache).length > 0) {
      console.log("📋 Using cached campaign mapping:", Object.keys(campaignCache).length, "campaigns");
      return campaignCache;
    }
    
    try {
      // Prefer Google Sheets mapping if configured
      if (process.env.GOOGLE_SHEETS_ID) {
        const { getSheetCampaignMapping } = await import('./google-sheets');
        const sheetMap = await getSheetCampaignMapping();
        if (Object.keys(sheetMap).length > 0) {
          campaignCache = sheetMap;
          cacheTimestamp = now;
          console.log("✅ Campaign mapping loaded from Google Sheets:", Object.keys(campaignCache).length);
          return campaignCache;
        }
      }

      const token = process.env.DIALFIRE_API_TOKEN;
      if (!token) {
        console.log("❌ DIALFIRE_API_TOKEN not configured for campaign mapping");
        return {};
      }

      console.log("🔍 Fetching fresh campaign data for mapping...");
      const tenantId = "9c6d0163";
      const baseUrl = "https://api.dialfire.com/api";
      const url = `${baseUrl}/tenants/${tenantId}/campaigns/`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        console.log(`❌ Campaign mapping failed: ${response.status} ${response.statusText}`);
        return campaignCache; // Return old cache if available
      }

      const campaigns = await response.json();
      
      if (Array.isArray(campaigns)) {
        campaignCache = {};
        campaigns.forEach((campaign: any) => {
          if (campaign.id && campaign.title) {
            campaignCache[campaign.id] = campaign.title;
          }
        });
        
        cacheTimestamp = now;
        console.log("✅ Campaign mapping updated:", Object.keys(campaignCache).length, "campaigns cached");
        console.log("🔍 Sample mappings:");
        Object.entries(campaignCache).slice(0, 3).forEach(([id, title]) => {
          console.log(`  ${id} → ${title}`);
        });
      }
      
      return campaignCache;
    } catch (error) {
      console.log("❌ Error fetching campaign mapping:", error);
      return campaignCache; // Return old cache if available
    }
  }

  // Get campaign mapping endpoint
  app.get("/api/campaign-mapping", async (req, res) => {
    try {
      const mapping = await fetchCampaignMapping();
      let merged: any = { mapping };
      if (process.env.GOOGLE_SHEETS_ID) {
        const { getSheetCampaignsFull } = await import('./google-sheets');
        const rows = await getSheetCampaignsFull();
        merged.rows = rows;
      }
      res.json({
        status: "success",
        campaigns: Object.keys(mapping).length,
        mapping: mapping,
        ...merged,
        cached_at: new Date(cacheTimestamp).toISOString()
      });
    } catch (error) {
      console.log("❌ Campaign mapping endpoint error:", error);
      res.status(500).json({ 
        error: "Failed to fetch campaign mapping",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Test Dialfire API endpoint (unique name to avoid conflicts)
  app.get("/api/dialfire-campaigns-test", async (req, res) => {
    console.log("🚀 Dialfire API test endpoint called");
    
    try {
      const token = process.env.DIALFIRE_API_TOKEN;
      console.log("🔑 Token available:", token ? "Yes" : "No");
      
      if (!token) {
        console.log("❌ DIALFIRE_API_TOKEN not configured");
        return res.status(500).json({ 
          error: "DIALFIRE_API_TOKEN not configured",
          timestamp: new Date().toISOString()
        });
      }

      console.log("🔍 Making request to Dialfire API...");
      const tenantId = "9c6d0163";
      const baseUrl = "https://api.dialfire.com/api";
      const url = `${baseUrl}/tenants/${tenantId}/campaigns/`;
      console.log("📡 URL:", url);
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });

      console.log("📊 Response status:", response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ Dialfire API Error: ${response.status} ${response.statusText}`);
        console.log("❌ Error response body:", errorText);
        
        return res.status(500).json({ 
          error: `Dialfire API Error: ${response.status} ${response.statusText}`,
          details: errorText,
          timestamp: new Date().toISOString()
        });
      }

      const data = await response.json();
      console.log("✅ Dialfire API Success!");
      console.log("📋 Response type:", Array.isArray(data) ? "Array" : typeof data);
      console.log("📊 Data keys:", typeof data === 'object' ? Object.keys(data) : "N/A");
      
      if (Array.isArray(data)) {
        console.log("📈 Found", data.length, "campaigns");
        if (data.length > 0) {
          console.log("🔍 First campaign sample:", JSON.stringify(data[0], null, 2));
        }
      }
      
      const result = {
        status: "success",
        dialfire_response: data,
        total_campaigns: Array.isArray(data) ? data.length : Object.keys(data || {}).length,
        timestamp: new Date().toISOString()
      };
      
      console.log("✅ Sending successful response");
      res.json(result);
    } catch (error: any) {
      console.error("❌ Dialfire API Test Error:", error);
      console.error("❌ Error details:", {
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      });
      
      res.status(500).json({ 
        error: "Failed to test Dialfire API",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Transcription API endpoint
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioUrl } = req.body;
      
      if (!audioUrl) {
        return res.status(400).json({ error: "audioUrl is required" });
      }
      
      console.log(`🎙️ Starting transcription for: ${audioUrl}`);
      
      // Submit transcription job (non-blocking)
      const job = await transcriptionService.submitTranscription(audioUrl);
      
      res.json({
        success: true,
        audioFileId: job.audio_file_id,
        status: job.status,
        message: "Transcription job submitted"
      });
      
    } catch (error: any) {
      console.error("❌ Transcription submission error:", error);
      res.status(500).json({ 
        error: "Failed to submit transcription",
        details: error.message 
      });
    }
  });

  // Check transcription status
  app.get("/api/transcribe/:audioFileId/status", async (req, res) => {
    try {
      const audioFileId = parseInt(req.params.audioFileId);
      
      if (isNaN(audioFileId)) {
        return res.status(400).json({ error: "Invalid audio file ID" });
      }
      
      const status = await transcriptionService.getTranscriptionStatus(audioFileId);
      
      res.json({
        success: true,
        ...status
      });
      
    } catch (error: any) {
      console.error("❌ Transcription status error:", error);
      res.status(500).json({ 
        error: "Failed to check transcription status",
        details: error.message 
      });
    }
  });

  // Get dynamic call categories for campaigns
  app.get("/api/campaign-categories/:campaignId?", async (req, res) => {
    try {
      const { campaignId } = req.params;
      
      console.log(`🔍 Fetching campaign categories for: ${campaignId || 'all campaigns'}`);
      
      // Dynamically import external-db functions
      const { getCampaignStateReference } = await import("./external-db");
      
      const categoryData = await getCampaignStateReference(campaignId);
      
      // Group categories by status
      const categoriesByStatus = {
        open: [] as string[],
        success: [] as string[], 
        declined: [] as string[]
      };
      
      categoryData.forEach(item => {
        if (item.transactions_status === 'open') {
          categoriesByStatus.open.push(item.transactions_status_detail);
        } else if (item.transactions_status === 'success') {
          categoriesByStatus.success.push(item.transactions_status_detail);
        } else if (item.transactions_status === 'declined') {
          categoriesByStatus.declined.push(item.transactions_status_detail);
        }
      });
      
      // Remove duplicates within each category
      Object.keys(categoriesByStatus).forEach(key => {
        categoriesByStatus[key as keyof typeof categoriesByStatus] = Array.from(
          new Set(categoriesByStatus[key as keyof typeof categoriesByStatus])
        );
      });
      
      console.log(`✅ Found categories:`, categoriesByStatus);
      
      res.json({
        campaignId: campaignId || 'all',
        categories: categoriesByStatus
      });
      
    } catch (error: any) {
      console.error("❌ Campaign categories error:", error);
      res.status(500).json({ 
        error: "Failed to fetch campaign categories",
        details: error.message 
      });
    }
  });

  // Get status for specific outcome in campaign
  app.get("/api/outcome-status/:campaignId/:outcomeDetail", async (req, res) => {
    try {
      const { campaignId, outcomeDetail } = req.params;
      
      // Dynamically import external-db functions
      const { getOutcomeStatus } = await import("./external-db");
      
      const status = await getOutcomeStatus(campaignId, outcomeDetail);
      
      if (status) {
        res.json({
          campaignId,
          outcomeDetail,
          status
        });
      } else {
        res.status(404).json({
          error: "Status not found",
          campaignId,
          outcomeDetail
        });
      }
      
    } catch (error: any) {
      console.error("❌ Outcome status error:", error);
      res.status(500).json({ 
        error: "Failed to fetch outcome status",
        details: error.message 
      });
    }
  });

  // DEBUG: Test contacts_name data in external database
  app.get("/api/debug/contacts-name", async (req, res) => {
    try {
      const { externalPool } = await import("./external-db");
      
      if (!externalPool) {
        return res.status(503).json({
          error: "External database not configured"
        });
      }
      
      const client = await externalPool.connect();
      
      console.log('🔍 DEBUG API: Querying contacts_name data from external database...');
      
      const result = await client.query(`
        SELECT contacts_name, contacts_firma, transactions_status_detail, transactions_fired_date 
        FROM agent_data 
        WHERE transactions_user_login = 'Efsane.Karaman' 
          AND transactions_fired_date = '2025-09-05' 
        LIMIT 10
      `);
      
      console.log(`🔍 DEBUG API: Found ${result.rows.length} rows from external database`);
      
      const sampleData = result.rows.map((row: any, index: number) => ({
        row_number: index + 1,
        contacts_name: row.contacts_name || 'NULL/EMPTY',
        contacts_firma: row.contacts_firma || 'NULL/EMPTY',
        outcome: row.transactions_status_detail,
        date: row.transactions_fired_date
      }));
      
      console.log('🔍 DEBUG API: Sample contacts_name data:', sampleData);
      
      client.release();
      
      const response = { 
        message: 'contacts_name sample data from external database',
        total_rows: result.rows.length,
        data: sampleData 
      };
      
      console.log('🔍 DEBUG API: Returning response:', response);
      res.json(response);
    } catch (error: any) {
      console.error('❌ Debug contacts_name error:', error);
      res.status(500).json({ error: 'Failed to query contacts_name data' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
