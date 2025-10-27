import { 
  type Agent, 
  type InsertAgent,
  type Project,
  type InsertProject,
  type CallOutcome,
  type InsertCallOutcome,
  type AgentStatistics,
  type InsertAgentStatistics,
  type CallDetails,
  type InsertCallDetails,
  type ProjectTargets,
  type InsertProjectTargets,
  type StatisticsFilter
} from "@shared/schema";
import { randomUUID, createHash } from "crypto";
import fs from 'fs';
import path from 'path';
import { IStorage } from "./storage";
import { 
  externalPool, 
  getUniqueAgents, 
  getUniqueCampaigns, 
  getCampaignAgentReference,
  getAgentData,
  getAgentCallDetails,
  getAggregatedKpis,
  getMonthlyCallTrends,
  getOutcomeDistribution,
  type AgentData,
  type CampaignAgentReference,
  type AggregatedKpiData
} from "./external-db";
import { loadCSVData, getUniqueAgents as getCsvAgents, getUniqueProjects as getCsvProjects } from './csv-parser';

export class ExternalStorage implements IStorage {
  private agents: Map<string, Agent> = new Map();
  private projects: Map<string, Project> = new Map();
  private callOutcomes: Map<string, CallOutcome> = new Map();
  private agentStatistics: Map<string, AgentStatistics> = new Map();
  private callDetails: Map<string, CallDetails> = new Map();
  private projectTargets: Map<string, ProjectTargets> = new Map();
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  // Cache for campaign id -> title mapping (Dialfire)
  private campaignMapping: Record<string, string> = {};
  private campaignMappingTs = 0;
  
  // KPI cache (5 minute TTL)
  private kpiCache: any = null;
  private kpiCacheTs = 0;
  private readonly KPI_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  
  // Chart data cache (10 minute TTL)
  private monthlyTrendsCache: Map<number, { data: any; ts: number }> = new Map();
  private outcomeDistCache: Map<string, { data: any; ts: number }> = new Map();
  private readonly CHART_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  
  // Test system für Live-Benachrichtigungen
  // REMOVED: Test system variables komplett entfernt auf Benutzeranfrage

  constructor() {
    // Don't initialize immediately, wait for first request
  }

  // ---------- Disk cache helpers (last-known-good) ----------
  private getCacheDir(): string {
    return path.resolve(import.meta.dirname, '.cache');
  }

  private ensureCacheDir() {
    try { fs.mkdirSync(this.getCacheDir(), { recursive: true }); } catch {}
  }

  private getCachePath(kind: 'agents' | 'projects'): string {
    return path.resolve(this.getCacheDir(), `${kind}.json`);
  }

  private async loadAgentsFromCache(): Promise<boolean> {
    try {
      const p = this.getCachePath('agents');
      if (!fs.existsSync(p)) return false;
      const raw = await fs.promises.readFile(p, 'utf8');
      const list = JSON.parse(raw) as Array<any>;
      this.agents.clear();
      list.forEach((a) => {
        this.agents.set(a.id, { ...a, createdAt: a.createdAt ? new Date(a.createdAt) : new Date() });
      });
      console.log(`📦 Loaded ${this.agents.size} agents from cache`);
      return this.agents.size > 0;
    } catch (e) {
      console.warn('⚠️ Failed to load agents cache:', e);
      return false;
    }
  }

  private async saveAgentsToCache(): Promise<void> {
    try {
      this.ensureCacheDir();
      const p = this.getCachePath('agents');
      const list = Array.from(this.agents.values()).map((a) => ({
        ...a,
        createdAt: (a as any).createdAt instanceof Date ? (a as any).createdAt.toISOString() : (a as any).createdAt,
      }));
      await fs.promises.writeFile(p, JSON.stringify(list), 'utf8');
      console.log(`💾 Saved ${list.length} agents to cache`);
    } catch (e) {
      console.warn('⚠️ Failed to write agents cache:', e);
    }
  }

  private async loadProjectsFromCache(): Promise<boolean> {
    try {
      const p = this.getCachePath('projects');
      if (!fs.existsSync(p)) return false;
      const raw = await fs.promises.readFile(p, 'utf8');
      const list = JSON.parse(raw) as Array<any>;
      this.projects.clear();
      list.forEach((proj) => {
        this.projects.set(proj.id, { ...proj, createdAt: proj.createdAt ? new Date(proj.createdAt) : new Date() });
      });
      console.log(`📦 Loaded ${this.projects.size} projects from cache`);
      return this.projects.size > 0;
    } catch (e) {
      console.warn('⚠️ Failed to load projects cache:', e);
      return false;
    }
  }

  private async saveProjectsToCache(): Promise<void> {
    try {
      this.ensureCacheDir();
      const p = this.getCachePath('projects');
      const list = Array.from(this.projects.values()).map((proj) => ({
        ...proj,
        createdAt: (proj as any).createdAt instanceof Date ? (proj as any).createdAt.toISOString() : (proj as any).createdAt,
      }));
      await fs.promises.writeFile(p, JSON.stringify(list), 'utf8');
      console.log(`💾 Saved ${list.length} projects to cache`);
    } catch (e) {
      console.warn('⚠️ Failed to write projects cache:', e);
    }
  }

  private makeStableId(input: string): string {
    // Deterministic pseudo-UUID v5-style derived from input
    const h = createHash('md5').update(input).digest('hex');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
  }

  private async initializeData() {
    if (this.initialized) return;
    
    // Prevent multiple simultaneous initializations
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }
  
  private async doInitialize() {
    console.log('🔄 Loading real data from external database...');
    
    let agentsLoaded = false;
    let projectsLoaded = false;
    
    // Try to load agents with error handling
    try {
      await this.loadAgentsFromExternal();
      agentsLoaded = true;
    } catch (error) {
      console.error('❌ Error loading agents from external DB:', error);
      // Fallback: load last-known-good cache
      const ok = await this.loadAgentsFromCache();
      if (ok) agentsLoaded = true;
    }
    
    // Try to load projects with error handling
    try {
      await this.loadProjectsFromExternal();
      projectsLoaded = true;
    } catch (error) {
      console.error('❌ Error loading projects from external DB:', error);
      // Fallback: load last-known-good cache
      const ok = await this.loadProjectsFromCache();
      if (ok) projectsLoaded = true;
    }
    
    // If both DB and cache failed, try seeding from CSV to keep UI usable
    if ((!agentsLoaded || !projectsLoaded) && this.agents.size === 0 && this.projects.size === 0) {
      const seeded = await this.seedFromCSV();
      if (seeded) {
        agentsLoaded = true;
        projectsLoaded = true;
      }
    }

    // Always load call outcomes (these are static)
    this.initializeCallOutcomes();

    // If either failed and no cache/seed, keep empty; otherwise continue
    if (!agentsLoaded || !projectsLoaded) {
      if (this.agents.size > 0 || this.projects.size > 0) {
        console.warn('⚠️ Using cached/seeded agents/projects due to DB connection issues');
      } else {
        console.error('❌ Database connection failed - no data will be displayed');
        console.log('ℹ️ System will show empty state until database connection is restored');
      }
    }
    
    // REMOVED: Test-System entfernt auf Benutzeranfrage
    // this.startTestCallDetailsGenerator();
    
    // REMOVED: Test system cleanup code entfernt da Eigenschaften entfernt wurden
    console.log('🧹 Test system completely removed - running on real data only');
    
    this.initialized = true;
    console.log(`✅ External data initialization complete: ${this.agents.size} agents, ${this.projects.size} projects`);
  }

  // REMOVED: Test-System komplett entfernt auf Benutzeranfrage

  // REMOVED: createTestCallDetail komplett entfernt auf Benutzeranfrage
  /*
  private createTestCallDetail(): CallDetails {
    const now = new Date();
    const companies = [
      'TestFirma GmbH', 'Beispiel AG', 'Demo Solutions', 'Mock Industries', 
      'Sample Corp', 'Test Solutions GmbH', 'Beispiel Service AG'
    ];
    const contacts = [
      'Max Mustermann', 'Anna Beispiel', 'Thomas Test', 'Sarah Sample',
      'Michael Mock', 'Lisa Demo', 'Klaus Beispiel'
    ];
    
    // Verschiedene Outcome-Kategorien für Farbkodierung-Tests
    const outcomes = [
      // Positive (grün) - success in database
      { outcome: 'Termin', category: 'positive' as const },
      { outcome: 'Termin | Infomail', category: 'positive' as const },
      { outcome: 'selbst gebucht', category: 'positive' as const },
      { outcome: 'selbständig_gebucht', category: 'positive' as const },
      
      // Open (blau) - open in database
      { outcome: '$none', category: 'open' as const },
      { outcome: 'offen', category: 'open' as const },
      { outcome: 'Rückruf', category: 'open' as const },
      { outcome: 'Rückruf_terminiert', category: 'open' as const },
      
      // Negative (rot) - declined in database
      { outcome: 'abgelehnt', category: 'negative' as const },
      { outcome: 'kein Interesse', category: 'negative' as const },
      { outcome: 'nicht erreicht', category: 'negative' as const }
    ];
    
    // Verwende echte Agent- und Projekt-IDs aus dem System
    const agentEntries = Array.from(this.agents.entries());
    const projectEntries = Array.from(this.projects.entries());
    
    // Fallback zu Test-IDs wenn keine echten IDs verfügbar sind
    let agentId = 'test-agent';
    let projectId = 'test-project';
    
    if (agentEntries.length > 0) {
      const randomAgentEntry = agentEntries[Math.floor(Math.random() * agentEntries.length)];
      agentId = randomAgentEntry[0]; // Use the agent ID (key)
    }
    
    if (projectEntries.length > 0) {
      const randomProjectEntry = projectEntries[Math.floor(Math.random() * projectEntries.length)];
      projectId = randomProjectEntry[0]; // Use the project ID (key)
    }
    
    // Zufällige Zeit in den letzten 30 Minuten
    const minutesAgo = Math.floor(Math.random() * 30);
    const callTime = new Date(now.getTime() - minutesAgo * 60 * 1000);
    
    const randomCompany = companies[Math.floor(Math.random() * companies.length)];
    const randomContact = contacts[Math.floor(Math.random() * contacts.length)];
    const randomDuration = Math.floor(Math.random() * 300) + 30; // 30-330 Sekunden
    const randomOutcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    
    return {
      id: `test-${randomUUID()}`,
      createdAt: now,
      agentId,
      projectId,
      outcome: randomOutcome.outcome,
      outcomeCategory: randomOutcome.category,
      contactName: randomCompany,
      contactPerson: randomContact,
      contactNumber: `+49 ${Math.floor(Math.random() * 900000) + 100000}`,
      callStart: callTime,
      callEnd: new Date(callTime.getTime() + randomDuration * 1000),
      duration: randomDuration,
      wrapupTimeSeconds: Math.floor(Math.random() * 60),
      waitTimeSeconds: Math.floor(Math.random() * 120),
      editTimeSeconds: 0,
      recordingUrl: null,
      notes: null
    };
  }
  */

  private async loadAgentsFromExternal() {
    // Load all unique agents directly from agent_data view
    const uniqueAgentLogins = await getUniqueAgents();
    
    console.log(`📊 Found ${uniqueAgentLogins.length} unique agents in external database`);
    console.log(`👥 Available agents: ${uniqueAgentLogins.slice(0, 10).join(', ')}${uniqueAgentLogins.length > 10 ? '...' : ''}`);
    
    // Clear existing agents to prevent duplicates
    this.agents.clear();
    
    uniqueAgentLogins.forEach(agentLogin => {
      const id = this.makeStableId(`agent:${agentLogin.trim()}`);
      this.agents.set(id, {
        id,
        name: agentLogin.trim(), // Use the login as display name, trimmed
        isActive: true,
        currentStatus: 'wartet' as Agent['currentStatus'],
        createdAt: new Date(),
      });
    });
    
    console.log(`✅ Loaded ${this.agents.size} unique agents (removed duplicates)`);
    // Persist to disk cache
    await this.saveAgentsToCache();
  }

  private async loadProjectsFromExternal() {
    const uniqueCampaigns = await getUniqueCampaigns();
    console.log(`📊 Found ${uniqueCampaigns.length} unique campaigns in external database`);
    
    // Clear existing projects to prevent duplicates
    this.projects.clear();
    
    // Create a Set to ensure uniqueness
    const uniqueCampaignSet = new Set(uniqueCampaigns.filter(campaign => campaign && campaign.trim() !== ''));
    
    uniqueCampaignSet.forEach(campaignId => {
      const id = this.makeStableId(`project:${campaignId.trim()}`);
      this.projects.set(id, {
        id,
        name: campaignId.trim(), // Use campaign ID as project name, trimmed
        isActive: true,
        createdAt: new Date(),
      });
    });
    
    console.log(`✅ Loaded ${this.projects.size} unique projects (removed duplicates)`);
    // Persist to disk cache
    await this.saveProjectsToCache();
  }

  // Seed from CSV when DB/cache are unavailable
  private async seedFromCSV(): Promise<boolean> {
    try {
      const data = loadCSVData();
      if (!data || data.length === 0) {
        console.warn('⚠️ CSV seed: no rows found in server/data.csv');
        return false;
      }

      // Seed agents
      this.agents.clear();
      const agentLogins = getCsvAgents(data);
      agentLogins.forEach((login) => {
        const name = String(login || '').trim();
        const id = this.makeStableId(`agent:${name}`);
        this.agents.set(id, {
          id,
          name,
          isActive: true,
          currentStatus: 'wartet' as any,
          createdAt: new Date(),
        });
      });

      // Seed projects
      this.projects.clear();
      const projectNames = getCsvProjects(data);
      projectNames.forEach((proj) => {
        const name = String(proj || '').trim();
        const id = this.makeStableId(`project:${name}`);
        this.projects.set(id, {
          id,
          name,
          isActive: true,
          createdAt: new Date(),
        });
      });

      await this.saveAgentsToCache();
      await this.saveProjectsToCache();
      console.log(`🌱 Seeded from CSV: ${this.agents.size} agents, ${this.projects.size} projects`);
      return this.agents.size > 0 || this.projects.size > 0;
    } catch (e) {
      console.warn('⚠️ Failed to seed from CSV:', e);
      return false;
    }
  }

  private initializeCallOutcomes() {
    const outcomeData = [
      { name: "KI Ansprechpartner", category: 'negative' as const, displayOrder: 1 },
      { name: "KI Gatekeeper", category: 'negative' as const, displayOrder: 2 },
      { name: "Partner vorhanden", category: 'negative' as const, displayOrder: 3 },
      { name: "falsche Zielgruppe", category: 'negative' as const, displayOrder: 4 },
      { name: "falsche Nummer", category: 'negative' as const, displayOrder: 5 },
      { name: "nicht mehr anrufen", category: 'negative' as const, displayOrder: 6 },
      { name: "Nie_wieder_anrufen", category: 'negative' as const, displayOrder: 7 }, // 🔧 FIX: Add missing outcome
      { name: "Kontaktformular", category: 'negative' as const, displayOrder: 8 }, // 🔧 FIX: Add missing outcome  
      { name: "Hotline", category: 'negative' as const, displayOrder: 9 },
      { name: "existiert nicht", category: 'negative' as const, displayOrder: 10 },
      { name: "Duplikat", category: 'negative' as const, displayOrder: 11 },
      { name: "Termin", category: 'positive' as const, displayOrder: 12 },
      { name: "Termin | Infomail", category: 'positive' as const, displayOrder: 13 },
      { name: "selbst gebucht", category: 'positive' as const, displayOrder: 14 },
      { name: "offen", category: 'offen' as const, displayOrder: 15 },
      { name: "Nachfassen automatisch", category: 'offen' as const, displayOrder: 16 },
      { name: "Nachfassen persönlich", category: 'offen' as const, displayOrder: 17 },
      { name: "zugewiesen", category: 'offen' as const, displayOrder: 18 },
    ];

    outcomeData.forEach(outcome => {
      const id = randomUUID();
      this.callOutcomes.set(id, {
        id,
        name: outcome.name,
        category: outcome.category,
        displayOrder: outcome.displayOrder,
      });
    });
  }


  // Convert optimized external data (multiple agents/projects) to statistics
  private convertOptimizedDataToStatistics(
    externalData: AgentData[],
    filter: StatisticsFilter,
    campaignTitleMap: Record<string, string>
  ): AgentStatistics[] {
    const statsMap = new Map<string, AgentStatistics>();
    
    // Process all records and group by agent + project + date
    externalData.forEach(record => {
      // Find agent and project IDs from names
      const agent = Array.from(this.agents.values()).find(a => a.name === record.transactions_user_login);
      const project = Array.from(this.projects.values()).find(p => p.name === record.contacts_campaign_id);
      
      if (!agent || !project) {
        return; // Skip if we can't find the agent or project
      }
      
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
          gespraechszeit: 0,
          wartezeit: 0,
          nachbearbeitungszeit: 0,
          vorbereitungszeit: 0,
          arbeitszeit: 0,
          erfolgProStunde: 0,
          outcomes: {},
          createdAt: new Date(),
          updatedAt: null,
        });
      }
      
      const stat = statsMap.get(dateKey)!;
      stat.anzahl += 1;
      
      // Add time metrics (hours)
      // connections_duration is in milliseconds in external DB → convert to hours
      const durationHours = (record.connections_duration || 0) / 3_600_000;
      stat.gespraechszeit += durationHours;

      if (record.transactions_wait_time_sec) {
        stat.wartezeit += record.transactions_wait_time_sec / 3600;
      }
      if (record.transactions_edit_time_sec != null) {
        // NBZ: isolate after-call work per documentation → edit_time - talk_time
        const nbzAdd = (record.transactions_edit_time_sec / 3600) - durationHours;
        stat.nachbearbeitungszeit += Math.max(0, nbzAdd);
      }
      if (record.transactions_pause_time_sec) {
        stat.vorbereitungszeit += record.transactions_pause_time_sec / 3600;
      }

      // AZ only for Terminhütte/Jagdhütte campaigns
      const resolvedTitle = campaignTitleMap[project.name] || project.name || '';
      const qualifiesForAZ = /Terminhütte|Jagdhütte|Terminhuette|Jagdhuette/i.test(resolvedTitle);
      if (qualifiesForAZ) {
        const recordWorkTimeHours =
          (record.transactions_wait_time_sec || 0) / 3600 +
          durationHours +
          // use NBZ add computed above
          Math.max(0, ((record.transactions_edit_time_sec || 0) / 3600) - durationHours) +
          (record.transactions_pause_time_sec || 0) / 3600;
        stat.arbeitszeit += recordWorkTimeHours;
      }
      
      // Count outcomes
      const status = record.transactions_status || '';
      const detail = record.transactions_status_detail || '';
      
      if (!stat.outcomes) stat.outcomes = {};
      
      if (status === 'success') {
        stat.erfolgreich += 1;
        stat.abgeschlossen += 1;
        const outcomeKey = detail || 'Unknown';
        stat.outcomes[outcomeKey] = (stat.outcomes[outcomeKey] || 0) + 1;
      } else if (status === 'declined') {
        stat.abgeschlossen += 1;
        const outcomeKey = detail || 'Unknown';
        stat.outcomes[outcomeKey] = (stat.outcomes[outcomeKey] || 0) + 1;
      } else if (status === 'open') {
        const outcomeKey = detail || 'Unknown';
        stat.outcomes[outcomeKey] = (stat.outcomes[outcomeKey] || 0) + 1;
      }
      
      stat.erfolgProStunde = stat.erfolgreich / 7.5;
    });
    
    return Array.from(statsMap.values());
  }

  // Convert external agent data to internal statistics format
  private convertExternalDataToStatistics(
    externalData: AgentData[], 
    agentId: string, 
    projectId: string,
    timeFilters?: { timeFrom?: string; timeTo?: string }
  ): AgentStatistics[] {
    // Apply time filters to the data if provided
    let filteredData = externalData;
    if (timeFilters && (timeFilters.timeFrom || timeFilters.timeTo)) {
      filteredData = externalData.filter(record => {
        const startTime = record.recordings_start_time;
        if (!startTime) return true; // Include records without time
        
        // Extract time from timestamp (format: "YYYY-MM-DD HH:MM:SS")
        const timePart = startTime.split(' ')[1]?.substring(0, 5); // Get "HH:MM"
        if (!timePart) return true; // Include if we can't parse time
        
        // Convert UTC to Cyprus time (+3 hours) - same logic as Call Details
        const [hours, minutes] = timePart.split(':').map(Number);
        
        // Add 3 hours for Cyprus timezone (with overflow handling)
        let cyprusHours = hours + 3;
        let cyprusMinutes = minutes;
        
        // Handle hour overflow (24+ becomes next day)
        if (cyprusHours >= 24) {
          cyprusHours -= 24;
        }
        
        const cyprusTime = `${cyprusHours.toString().padStart(2, '0')}:${cyprusMinutes.toString().padStart(2, '0')}`;
        
        const timeFromMatch = !timeFilters.timeFrom || cyprusTime >= timeFilters.timeFrom;
        const timeToMatch = !timeFilters.timeTo || cyprusTime <= timeFilters.timeTo;
        const timeMatch = timeFromMatch && timeToMatch;
        
        return timeMatch;
      });
    }
    
    // REMOVED: Test data integration komplett entfernt auf Benutzeranfrage
    // Nur echte Daten aus der Datenbank werden verwendet
    
    const statsMap = new Map<string, AgentStatistics>();

    filteredData.forEach(record => {
      const dateKey = record.transactions_fired_date;
      
      if (!statsMap.has(dateKey)) {
        statsMap.set(dateKey, {
          id: randomUUID(),
          agentId,
          projectId,
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
      stat.anzahl += 1;
      
      // Convert duration to hours (agent_data provides seconds)
      // connections_duration is milliseconds → hours
      const durationHours = (Number(record.connections_duration) || 0) / 3_600_000;
      stat.gespraechszeit += durationHours;
      
      // Convert waiting time from seconds to hours (WZ)
      if (record.transactions_wait_time_sec) {
        const waitingTimeHours = record.transactions_wait_time_sec / 3600; // Convert seconds to hours
        stat.wartezeit += waitingTimeHours;
      }

      // NBZ - Nachbearbeitungszeit per documentation (edit - talk)
      if (record.transactions_edit_time_sec != null) {
        const nbzAdd = (record.transactions_edit_time_sec / 3600) - durationHours;
        stat.nachbearbeitungszeit += Math.max(0, nbzAdd);
      }

      // Convert pause time from seconds to hours (VBZ - Vorbereitungszeit)
      if (record.transactions_pause_time_sec) {
        const pauseTimeHours = record.transactions_pause_time_sec / 3600; // Convert seconds to hours
        stat.vorbereitungszeit += pauseTimeHours;
      }

      // AZ only for qualifying campaign names
      const projectForAZ = this.projects.get(projectId);
      const resolvedTitle = projectForAZ ? (this.campaignMapping[projectForAZ.name] || projectForAZ.name) : '';
      const qualifiesForAZ2 = /Terminhütte|Jagdhütte|Terminhuette|Jagdhuette/i.test(resolvedTitle);
      if (qualifiesForAZ2) {
        const recordWorkTimeHours =
          (record.transactions_wait_time_sec || 0) / 3600 +
          durationHours +
          Math.max(0, ((record.transactions_edit_time_sec || 0) / 3600) - durationHours) +
          (record.transactions_pause_time_sec || 0) / 3600;
        stat.arbeitszeit += recordWorkTimeHours;
      }


      // Count outcomes based on real data structure from your file
      const status = record.transactions_status || '';
      const detail = record.transactions_status_detail || '';
      
      if (!stat.outcomes) stat.outcomes = {};
      
      if (status === 'success') {
        stat.erfolgreich += 1;
        stat.abgeschlossen += 1;
        const outcomeKey = detail || 'Unknown';
        stat.outcomes[outcomeKey] = (stat.outcomes[outcomeKey] || 0) + 1;
        
        // DISCREPANCY DEBUG: Log all success outcomes for comparison with Call Details
        if (outcomeKey === 'Termin') {
          console.log(`🔍 STATISTICS DEBUG: Found SUCCESS->Termin: status=${status}, detail=${detail}, mapped=${outcomeKey}, date=${record.transactions_fired_date}`);
        }
      } else if (status === 'declined') {
        // Only declined calls are "abgeschlossen" 
        stat.abgeschlossen += 1;
        const outcomeKey = detail || 'Unknown';
        stat.outcomes[outcomeKey] = (stat.outcomes[outcomeKey] || 0) + 1;
      } else if (status === 'open') {
        // Open calls are NOT abgeschlossen - they are ongoing
        const outcomeKey = detail || 'Unknown';
        stat.outcomes[outcomeKey] = (stat.outcomes[outcomeKey] || 0) + 1;
      } else {
        // 🔧 FIX: Handle unknown/unmapped status - treat as open to ensure total consistency
        console.log(`⚠️ UNKNOWN STATUS FOUND: status="${status}", detail="${detail}", date=${record.transactions_fired_date} - treating as open`);
        const outcomeKey = detail || status || 'Unknown';
        stat.outcomes[outcomeKey] = (stat.outcomes[outcomeKey] || 0) + 1;
      }

      // Calculate success rate per hour based on standard 7.5h workday
      stat.erfolgProStunde = stat.erfolgreich / 7.5;
    });

    // 🔧 DEBUG: Verify data consistency after processing
    Array.from(statsMap.values()).forEach(stat => {
      const outcomesTotal = Object.values(stat.outcomes || {}).reduce((sum, count) => sum + count, 0);
      
      // 🚨 CRITICAL DEBUG: Show the exact values being calculated for abgeschlossen vs erfolgreich
      console.log(`🔍 CRITICAL STATS DEBUG: Agent ${agentId}, Date ${stat.date.toISOString().slice(0,10)}:`);
      console.log(`   📊 anzahl: ${stat.anzahl} (should equal outcomesTotal)`);
      console.log(`   ✅ abgeschlossen: ${stat.abgeschlossen} (should equal erfolgreich + declined calls)`);
      console.log(`   🎯 erfolgreich: ${stat.erfolgreich} (positive calls only)`);
      console.log(`   📋 Outcomes:`, stat.outcomes);
      
      if (stat.anzahl !== outcomesTotal) {
        console.log(`⚠️ INCONSISTENCY DETECTED: Agent ${agentId}, Date ${stat.date.toISOString().slice(0,10)}: Total=${stat.anzahl}, OutcomesSum=${outcomesTotal}, Difference=${stat.anzahl - outcomesTotal}`);
        console.log(`📊 Outcomes breakdown:`, stat.outcomes);
      } else {
        console.log(`✅ DATA CONSISTENT: Agent ${agentId}, Date ${stat.date.toISOString().slice(0,10)}: Total=${stat.anzahl} = OutcomesSum=${outcomesTotal}`);
      }
    });

    return Array.from(statsMap.values());
  }

  private mapExternalOutcomeToInternal(externalOutcome: string, isSuccess: boolean): string {
    if (!externalOutcome) {
      return isSuccess ? 'Erfolgreich' : 'Nicht erfolgreich';
    }
    
    const outcome = externalOutcome.trim();
    
    // Handle the most common case first: $none means "offen/in Bearbeitung"
    if (outcome === '$none') {
      return 'offen';
    }
    
    // Handle other special cases
    if (outcome === '$follow_up_auto') {
      return 'Nachfassen automatisch';
    }
    
    if (outcome === '$follow_up_personal') {
      return 'Nachfassen persönlich';
    }
    
    if (outcome === '$assigned') {
      return 'zugewiesen';
    }
    
    // Handle specific outcomes
    if (outcome === 'KI_Ansprechpartner') {
      return 'KI Ansprechpartner';
    }
    
    if (outcome === 'KI_Gatekeeper') {
      return 'KI Gatekeeper';
    }
    
    if (outcome === 'falsche_Zielgruppe') {
      return 'falsche Zielgruppe';
    }
    
    if (outcome === 'Termin') {
      return 'Termin';
    }
    
    if (outcome === 'Zentrale') {
      return 'Zentrale';
    }
    
    // For any other values, return them as-is
    return outcome;
  }

  // Agent methods
  async getAgent(id: string): Promise<Agent | undefined> {
    await this.initializeData();
    return this.agents.get(id);
  }

  async getAllAgents(): Promise<Agent[]> {
    await this.initializeData();
    return Array.from(this.agents.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    throw new Error('Create operations not allowed on external read-only database');
  }

  async updateAgentStatus(id: string, status: Agent['currentStatus']): Promise<void> {
    // Allow status updates for UI purposes only (not persisted to external DB)
    const agent = this.agents.get(id);
    if (agent) {
      this.agents.set(id, { ...agent, currentStatus: status });
    }
  }

  // Project methods
  async getProject(id: string): Promise<Project | undefined> {
    await this.initializeData();
    return this.projects.get(id);
  }

  async getAllProjects(): Promise<Project[]> {
    await this.initializeData();
    return Array.from(this.projects.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProjectsForAgents(agentIds: string[]): Promise<Project[]> {
    await this.initializeData();
    
    if (!agentIds || agentIds.length === 0) {
      return [];
    }

    try {
      // Get campaign agent reference data to find which projects the agents work on
      const campaignData = await getCampaignAgentReference();
      
      // Find projects for the selected agents
      const agentNames = agentIds.map(id => this.agents.get(id)?.name).filter(Boolean);
      const relevantCampaignIds = new Set<string>();
      
      campaignData.forEach(record => {
        if (agentNames.includes(record.transactions_user_login)) {
          relevantCampaignIds.add(record.contacts_campaign_id);
        }
      });

      // Filter projects that match the campaign IDs
      const relevantProjects = Array.from(this.projects.values())
        .filter(project => relevantCampaignIds.has(project.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      return relevantProjects;
    } catch (error) {
      console.error('Error loading projects for agents:', error);
      // Fallback to all projects if error occurs
      return Array.from(this.projects.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    throw new Error('Create operations not allowed on external read-only database');
  }

  // Call outcome methods
  async getAllCallOutcomes(): Promise<CallOutcome[]> {
    return Array.from(this.callOutcomes.values()).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async createCallOutcome(insertOutcome: InsertCallOutcome): Promise<CallOutcome> {
    throw new Error('Create operations not allowed on external read-only database');
  }

  // Statistics methods - OPTIMIZED: Single query instead of N+1 queries
  async getAgentStatistics(filter: StatisticsFilter): Promise<AgentStatistics[]> {
    await this.initializeData();
    
    try {
      // If no specific agents selected, return empty array
      if (!filter.agentIds || filter.agentIds.length === 0) {
        return [];
      }

      // Build date range for external query
      let dateFrom: string | undefined;
      let dateTo: string | undefined;

      console.log(`📊 OPTIMIZED: Processing filter for ${filter.agentIds.length} agents`);
      
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

      // PERFORMANCE IMPROVEMENT: Single optimized query instead of nested loops
      try {
        console.log(`🚀 OPTIMIZED: Making SINGLE DB query with dateFrom=${dateFrom}, dateTo=${dateTo}`);
        const externalData = await this.getOptimizedAgentData(filter.agentIds, filter.projectIds, dateFrom, dateTo, filter.timeFrom, filter.timeTo);
        // Ensure campaign mapping is available for AZ calculation
        const campaignTitleMap = await this.getCampaignMapping();
        console.log(`🚀 OPTIMIZED: Received ${externalData.length} pre-filtered records from single DB query`);
        
        // Convert external data to statistics format efficiently
        const allStats = this.convertOptimizedDataToStatistics(externalData, filter, campaignTitleMap);
        
        console.log(`📊 OPTIMIZED: Generated ${allStats.length} statistics from optimized query`);
        return allStats;
        
      } catch (error) {
        console.error('❌ OPTIMIZED: Error in optimized statistics query:', error);
        return [];
      }
    } catch (error) {
      console.error('❌ OPTIMIZED: Error in getAgentStatistics:', error);
      return [];
    }
  }
  
  // PERFORMANCE: New optimized single DB query method
  private async getOptimizedAgentData(
    agentIds: string[], 
    projectIds?: string[], 
    dateFrom?: string, 
    dateTo?: string,
    timeFrom?: string,
    timeTo?: string
  ): Promise<AgentData[]> {
    if (!externalPool) {
      throw new Error("External database not configured");
    }
    const client = await externalPool.connect();
    try {
      // Build agent names from IDs
      const agentNames = agentIds.map(id => this.agents.get(id)?.name).filter(Boolean);
      const projectNames = projectIds ? projectIds.map(id => this.projects.get(id)?.name).filter(Boolean) : undefined;
      
      if (agentNames.length === 0) {
        return [];
      }
      
      console.log(`🚀 OPTIMIZED DB: Querying for ${agentNames.length} agents, ${projectNames?.length || 'ALL'} projects`);
      
      const conditions = [];
      const params: any[] = [];
      
      // Agent filter with IN clause
      conditions.push(`transactions_user_login = ANY($${params.length + 1})`);
      params.push(agentNames);
      
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
      
      // Time range filter (derive time from recordings_started; DB stores UTC → convert Cyprus to UTC)
      if (timeFrom || timeTo) {
        const timeExpr = `to_char(recordings_started, 'HH24:MI')`;
        if (timeFrom) {
          const [hours, minutes] = timeFrom.split(':').map(Number);
          const utcHours = (hours - 3 + 24) % 24;
          const utcTimeFrom = `${utcHours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}`;
          conditions.push(`${timeExpr} >= $${params.length + 1}`);
          params.push(utcTimeFrom);
        }
        if (timeTo) {
          const [hours, minutes] = timeTo.split(':').map(Number);
          const utcHours = (hours - 3 + 24) % 24;
          const utcTimeTo = `${utcHours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}`;
          conditions.push(`${timeExpr} <= $${params.length + 1}`);
          params.push(utcTimeTo);
        }
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Use DISTINCT ON for deduplication with performance limit and select only needed columns
      const query = `
        SELECT DISTINCT ON (transaction_id)
          transaction_id,
          transactions_fired_date,
          recordings_start_time,
          connections_duration,
          transactions_user_login,
          transactions_status,
          transactions_status_detail,
          transactions_wait_time_sec,
          transactions_edit_time_sec,
          transactions_pause_time_sec,
          contacts_campaign_id
        FROM agent_data 
        ${whereClause}
        ORDER BY transaction_id, recordings_started DESC NULLS LAST, connections_duration DESC NULLS LAST
        LIMIT 50000
      `;
      
      console.log(`🚀 OPTIMIZED DB: Executing optimized query with ${params.length} parameters`);
      const result = await client.query(query, params);
      
      console.log(`🚀 OPTIMIZED DB: Found ${result.rows.length} records in single query`);
      return result.rows;
      
    } finally {
      client.release();
    }
  }

  // Fetch campaign mapping from Dialfire API with cache
  private async getCampaignMapping(): Promise<Record<string, string>> {
    const now = Date.now();
    if (now - this.campaignMappingTs < 60 * 60 * 1000 && Object.keys(this.campaignMapping).length > 0) {
      return this.campaignMapping;
    }
    try {
      const token = process.env.DIALFIRE_API_TOKEN;
      if (!token) {
        return this.campaignMapping; // empty / previous
      }
      const tenantId = "9c6d0163";
      const baseUrl = "https://api.dialfire.com/api";
      const url = `${baseUrl}/tenants/${tenantId}/campaigns/`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!resp.ok) return this.campaignMapping;
      const campaigns = await resp.json();
      if (Array.isArray(campaigns)) {
        const map: Record<string, string> = {};
        campaigns.forEach((c: any) => { if (c.id && c.title) map[c.id] = c.title; });
        this.campaignMapping = map;
        this.campaignMappingTs = now;
      }
    } catch {
      // ignore
    }
    return this.campaignMapping;
  }

  async getMonthlyCallTrends(year: number): Promise<{ month: string; calls: number }[]> {
    await this.initializeData();
    
    // Check cache first
    const cached = this.monthlyTrendsCache.get(year);
    if (cached && (Date.now() - cached.ts < this.CHART_CACHE_TTL)) {
      console.log(`📊 Monthly Trends Cache: Returning cached data for ${year} (age: ${Math.round((Date.now() - cached.ts) / 1000)}s)`);
      return cached.data;
    }
    
    const allAgentLogins = Array.from(this.agents.values()).map(a => a.name);
    
    if (allAgentLogins.length === 0) {
      return [];
    }
    
    const data = await getMonthlyCallTrends(allAgentLogins, year);
    
    // Cache the result
    this.monthlyTrendsCache.set(year, { data, ts: Date.now() });
    console.log(`✅ Monthly Trends Cache: Stored data for ${year}, expires in ${this.CHART_CACHE_TTL / 1000}s`);
    
    return data;
  }

  async getOutcomeDistribution(dateFrom: string, dateTo: string): Promise<{ name: string; count: number; percentage: number }[]> {
    await this.initializeData();
    
    // Check cache first
    const cacheKey = `${dateFrom}-${dateTo}`;
    const cached = this.outcomeDistCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < this.CHART_CACHE_TTL)) {
      console.log(`📊 Outcome Distribution Cache: Returning cached data (age: ${Math.round((Date.now() - cached.ts) / 1000)}s)`);
      return cached.data;
    }
    
    const allAgentLogins = Array.from(this.agents.values()).map(a => a.name);
    
    if (allAgentLogins.length === 0) {
      return [];
    }
    
    const data = await getOutcomeDistribution(allAgentLogins, dateFrom, dateTo);
    
    // Cache the result
    this.outcomeDistCache.set(cacheKey, { data, ts: Date.now() });
    console.log(`✅ Outcome Distribution Cache: Stored data, expires in ${this.CHART_CACHE_TTL / 1000}s`);
    
    return data;
  }

  async getAggregatedKpisWithCache(refresh: boolean = false): Promise<AggregatedKpiData[]> {
    await this.initializeData();
    
    const now = Date.now();
    
    if (!refresh && this.kpiCache && (now - this.kpiCacheTs < this.KPI_CACHE_TTL)) {
      console.log('📊 KPI Cache: Returning cached data (age: ' + Math.round((now - this.kpiCacheTs) / 1000) + 's)');
      return this.kpiCache;
    }
    
    console.log('📊 KPI Cache: Fetching fresh data from database');
    
    const allAgentLogins = Array.from(this.agents.values()).map(a => a.name);
    
    if (allAgentLogins.length === 0) {
      console.log('⚠️ No agents found, returning empty KPI data');
      return [];
    }
    
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay() + 1);
    
    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(currentWeekStart.getDate() - 7);
    
    const lastWeekEnd = new Date(currentWeekStart);
    lastWeekEnd.setDate(currentWeekStart.getDate() - 1);
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    const dateFrom = formatDate(lastWeekStart);
    const dateTo = formatDate(today);
    
    console.log(`📊 KPI Query: Fetching 2 weeks of data (${dateFrom} to ${dateTo}) for ${allAgentLogins.length} agents`);
    
    try {
      const kpiData = await getAggregatedKpis(allAgentLogins, dateFrom, dateTo);
      
      this.kpiCache = kpiData;
      this.kpiCacheTs = now;
      
      console.log(`✅ KPI Cache: Stored ${kpiData.length} week(s) of data, expires in ${this.KPI_CACHE_TTL / 1000}s`);
      
      return kpiData;
    } catch (error) {
      console.error('❌ Error fetching aggregated KPIs:', error);
      return this.kpiCache || [];
    }
  }

  async createOrUpdateStatistics(insertStats: InsertAgentStatistics): Promise<AgentStatistics> {
    throw new Error('Create operations not allowed on external read-only database');
  }

  // Call details methods - Load real call details from external database
  async getCallDetails(agentId: string, projectId: string, dateFrom?: Date, dateTo?: Date, timeFrom?: string, timeTo?: string): Promise<CallDetails[]> {
    await this.initializeData();
    
    console.log(`🔍 ExternalStorage.getCallDetails called with timeFrom=${timeFrom}, timeTo=${timeTo}`);
    
    try {
      const agent = this.agents.get(agentId);
      const project = this.projects.get(projectId);
      
      console.log(`🔍 Call Details Request: agentId=${agentId}, projectId=${projectId}`);
      console.log(`📋 Agent found: ${agent ? agent.name : 'NOT FOUND'}`);
      console.log(`📋 Project found: ${project ? project.name : 'NOT FOUND'}`);
      
      // Query external database for call details with optimized filtering
      const dateFromStr = dateFrom ? dateFrom.toISOString().split('T')[0] : undefined;
      const dateToStr = dateTo ? dateTo.toISOString().split('T')[0] : undefined;
      
      console.log(`🗓️ Date range: ${dateFromStr} to ${dateToStr}`);
      
      // Use the stored agent and project names directly - they are the correct ones from our mapping
      let realAgentName = agent?.name;
      let realProjectName = project?.name;
      
      if (!realAgentName || !realProjectName) {
        console.log(`❌ Missing agent or project name: agent="${realAgentName}", project="${realProjectName}"`);
        return [];
      }
      
      console.log(`✅ Using stored names directly: agent="${realAgentName}", project="${realProjectName}"`);
      
      const { getAgentCallDetails } = await import('./external-db');
      console.log(`🔍 Calling getAgentCallDetails with: agent="${realAgentName}", project="${realProjectName}", dateFrom="${dateFromStr}", dateTo="${dateToStr}"`);
      const filteredData = await getAgentCallDetails(realAgentName!.trim(), realProjectName!.trim(), dateFromStr, dateToStr, 0);
      
      console.log(`🎯 Filtered to ${filteredData.length} records for ${realAgentName} + ${realProjectName}`);
      
      // DEBUG: Zeige die echten Outcome-Verteilungen in diesen Daten
      const outcomeCount = new Map();
      filteredData.forEach(record => {
        const outcome = record.transactions_status_detail || 'NULL';
        const status = record.transactions_status || 'NULL';
        const key = `${outcome} (${status})`;
        outcomeCount.set(key, (outcomeCount.get(key) || 0) + 1);
      });
      
      console.log(`📊 Outcome-Verteilung in den ${filteredData.length} Datensätzen:`);
      outcomeCount.forEach((count, outcome) => {
        console.log(`  - ${outcome}: ${count}x`);
      });
      
      console.log(`📊 Found ${filteredData.length} call records from database`);


      // Convert to CallDetails format
      const callDetails: CallDetails[] = filteredData.map((record, index) => {
        // Create groupId for grouping (shared for same contact/campaign/date)
        const groupingKey = `${record.contacts_id}_${record.contacts_campaign_id}_${record.transactions_fired_date}`.replace(/[^a-zA-Z0-9]/g, '_');
        const groupId = createHash('md5').update(groupingKey).digest('hex').substring(0, 8);
        
        // Unique key even if transaction_id is missing
        const uniqueKey = `${record.transaction_id || ''}_${record.contacts_id || ''}_${record.contacts_campaign_id || ''}_${record.transactions_fired_date || ''}`;
        const fallbackId = createHash('md5').update(uniqueKey).digest('hex');
        const uniqueId = record.transaction_id || `row_${fallbackId}`;
        
        return {
        id: uniqueId, // Always guaranteed unique ID
        agentId,
        projectId,
        contactName: record.contacts_firma || null,
        contactPerson: record.contacts_full_name || record.contacts_name || null, // Map contacts_full_name to contactPerson (Ansprechpartner)
        contactNumber: record.connections_phone,
        callStart: new Date(record.recordings_started),
        callEnd: record.recordings_stopped ? new Date(record.recordings_stopped) : null,
        duration: Math.round(parseInt(record.connections_duration.toString()) / 1000), // Convert milliseconds to seconds
        outcome: record.transactions_status_detail || 'Unknown',
        outcomeCategory: record.transactions_status === 'success' ? 'positive' : 'negative',
        recordingUrl: record.recordings_location,
        notes: record.contacts_notiz || null,
        // Test columns with real agent data - CORRECTED MAPPING
        wrapupTimeSeconds: record.transactions_edit_time_sec || null, // NBZ (s) - Nachbearbeitungszeit
        waitTimeSeconds: record.transactions_wait_time_sec || null, // WZ (s) - Wartezeit
        editTimeSeconds: record.transactions_pause_time_sec || null, // VBZ (s) - Vorbereitungszeit
        // Grouping fields
        contactsId: record.contacts_id || null,
        contactsCampaignId: record.contacts_campaign_id || null,
        recordingsDate: record.transactions_fired_date ? record.transactions_fired_date.split(' ')[0] : null, // Extract date part only
        groupId, // Shared ID for calls that should be grouped together
        createdAt: new Date(),
        };
      });

      // CRITICAL DEBUG: Show KI Gatekeeper times ALWAYS (not just when filtering)
      const kiGatekeeperDebug = callDetails
        .filter(call => call.outcome === 'KI Gatekeeper')
        .map(call => ({
          time: call.callStart.toTimeString().slice(0, 5),
          outcome: call.outcome,
          id: call.id.slice(0, 8),
          fullDate: call.callStart.toISOString(),
          localTime: call.callStart.toString(),
          originalRecordTime: call.callStart
        }));
      console.log(`🚨🚨🚨 CRITICAL: Found ${kiGatekeeperDebug.length} KI Gatekeeper calls with ACTUAL TIMES:`, kiGatekeeperDebug);
      
      // Apply time filtering if provided
      let filteredCallDetails = callDetails;
      if (timeFrom || timeTo) {
        console.log(`⏰ Applying time filter: ${timeFrom || 'start'} to ${timeTo || 'end'}`);
        
        // Debug: Show ALL call times to understand the discrepancy
        const allCallTimes = callDetails.map(call => ({
          time: call.callStart.toTimeString().slice(0, 5),
          outcome: call.outcome,
          id: call.id.slice(0, 8),
          fullDate: call.callStart.toISOString()
        }));
        console.log(`🔍 DEBUG: ALL ${callDetails.length} call times:`, allCallTimes.slice(0, 10));
        
        console.log(`🚀 STARTING FILTER PROCESS: About to filter ${callDetails.length} calls`);
        
        filteredCallDetails = callDetails.filter(detail => {
          const utcTime = detail.callStart.toTimeString().slice(0, 5);
          console.log(`🧪 TESTING FILTER: Processing call with UTC time ${utcTime}, outcome: ${detail.outcome}`);
          
          // Convert UTC time to Cyprus time (+3 hours) for filtering
          const cyprusTime = new Date(detail.callStart.getTime() + (3 * 60 * 60 * 1000));
          const callTime = cyprusTime.toTimeString().slice(0, 5); // "HH:MM" in Cyprus time
          
          console.log(`🌍 UTC: ${utcTime} → Cyprus: ${callTime} (outcome: ${detail.outcome})`);
          
          if (timeFrom && callTime < timeFrom) {
            console.log(`❌ FILTERED OUT: ${callTime} < ${timeFrom}`);
            return false;
          }
          if (timeTo && callTime > timeTo) {
            console.log(`❌ FILTERED OUT: ${callTime} > ${timeTo}`);
            return false;
          }
          console.log(`✅ KEPT: ${callTime} within ${timeFrom}-${timeTo}`);
          return true;
        });
        console.log(`⏰ Time filtered: ${callDetails.length} → ${filteredCallDetails.length} call details`);
      }

      // Debug: Show final outcomes in call details after mapping
      const finalOutcomeCounts = filteredCallDetails.reduce((acc, call) => {
        acc[call.outcome] = (acc[call.outcome] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`🎯 Final Call Details Outcomes after mapping:`, finalOutcomeCounts);
      
      // DISCREPANCY DEBUG: Show details for "Termin" outcome specifically
      const terminEntries = filteredCallDetails.filter(call => call.outcome === 'Termin');
      console.log(`🔍 DISCREPANCY DEBUG: Found ${terminEntries.length} "Termin" entries in Call Details for ${realAgentName}/${realProjectName}:`, 
        terminEntries.map(t => ({ id: t.id.slice(0,8), groupId: t.groupId?.slice(0,8) || 'NO_GROUP', date: t.callStart.toISOString().slice(0,10), status: t.outcomeCategory })));

      // REMOVED: Test entries komplett entfernt auf Benutzeranfrage
      // Nur echte Call-Details aus der Datenbank werden verwendet

      return filteredCallDetails.sort((a, b) => new Date(b.callStart).getTime() - new Date(a.callStart).getTime());
    } catch (error) {
      console.error('Error loading call details from external DB:', error);
      return [];
    }
  }

  async getCallDetailsForAgents(agentIds: string[], projectId: string, dateFrom?: Date, dateTo?: Date, timeFrom?: string, timeTo?: string): Promise<CallDetails[]> {
    await this.initializeData();
    
    console.log(`🔍 ExternalStorage.getCallDetailsForAgents called for ${agentIds.length} agents, project=${projectId}`);
    
    try {
      const project = this.projects.get(projectId);
      if (!project) {
        console.log(`❌ Project not found: ${projectId}`);
        return [];
      }
      
      const projectName = project.name;
      console.log(`📋 Project found: ${projectName}`);
      
      // Get all agent names
      const agentNames = agentIds
        .map(id => this.agents.get(id)?.name)
        .filter(Boolean) as string[];
      
      if (agentNames.length === 0) {
        console.log(`❌ No valid agent names found for IDs:`, agentIds);
        return [];
      }
      
      console.log(`📋 Agents found: ${agentNames.join(', ')}`);
      
      const dateFromStr = dateFrom ? dateFrom.toISOString().split('T')[0] : undefined;
      const dateToStr = dateTo ? dateTo.toISOString().split('T')[0] : undefined;
      
      console.log(`🗓️ Date range: ${dateFromStr} to ${dateToStr}`);
      console.log(`⏰ Time range: ${timeFrom || 'start'} to ${timeTo || 'end'}`);
      
      // Fetch call details for all agents in parallel
      const { getAgentCallDetails } = await import('./external-db');
      
      const allCallDetailsPromises = agentNames.map(async (agentName, idx) => {
        const agentId = agentIds[idx];
        console.log(`🔍 Fetching calls for agent: ${agentName}`);
        const filteredData = await getAgentCallDetails(agentName.trim(), projectName.trim(), dateFromStr, dateToStr, 0);
        console.log(`📊 Found ${filteredData.length} calls for ${agentName}`);
        
        // Convert to CallDetails format
        return filteredData.map((record) => {
          const groupingKey = `${record.contacts_id}_${record.contacts_campaign_id}_${record.transactions_fired_date}`.replace(/[^a-zA-Z0-9]/g, '_');
          const groupId = createHash('md5').update(groupingKey).digest('hex').substring(0, 8);
          
          const uniqueKey = `${record.transaction_id || ''}_${record.contacts_id || ''}_${record.contacts_campaign_id || ''}_${record.transactions_fired_date || ''}`;
          const fallbackId = createHash('md5').update(uniqueKey).digest('hex');
          const uniqueId = record.transaction_id || `row_${fallbackId}`;
          
          return {
            id: uniqueId,
            agentId,
            projectId,
            contactName: record.contacts_firma || null,
            contactPerson: record.contacts_full_name || record.contacts_name || null,
            contactNumber: record.connections_phone,
            callStart: new Date(record.recordings_started),
            callEnd: record.recordings_stopped ? new Date(record.recordings_stopped) : null,
            duration: Math.round(parseInt(record.connections_duration.toString()) / 1000),
            outcome: record.transactions_status_detail || 'Unknown',
            outcomeCategory: (record.transactions_status === 'success' ? 'positive' : 'negative') as 'positive' | 'negative' | 'offen',
            recordingUrl: record.recordings_location,
            notes: record.contacts_notiz || null,
            wrapupTimeSeconds: record.transactions_edit_time_sec || null,
            waitTimeSeconds: record.transactions_wait_time_sec || null,
            editTimeSeconds: record.transactions_pause_time_sec || null,
            contactsId: record.contacts_id || null,
            contactsCampaignId: record.contacts_campaign_id || null,
            recordingsDate: record.transactions_fired_date ? record.transactions_fired_date.split(' ')[0] : null,
            groupId,
            createdAt: new Date(),
          };
        });
      });
      
      const allCallDetailsArrays = await Promise.all(allCallDetailsPromises);
      let allCallDetails = allCallDetailsArrays.flat();
      
      console.log(`📊 Total calls across all agents: ${allCallDetails.length}`);
      
      // Apply time filtering if provided
      if (timeFrom || timeTo) {
        console.log(`⏰ Applying time filter: ${timeFrom || 'start'} to ${timeTo || 'end'}`);
        
        allCallDetails = allCallDetails.filter(detail => {
          const utcTime = detail.callStart.toTimeString().slice(0, 5);
          
          // Convert UTC time to Cyprus time (+3 hours) for filtering
          const [utcHours, utcMinutes] = utcTime.split(':').map(Number);
          const utcMinutesTotal = utcHours * 60 + utcMinutes;
          const cyprusMinutesTotal = utcMinutesTotal + 180;
          const cyprusHours = Math.floor(cyprusMinutesTotal / 60) % 24;
          const cyprusMinutes = cyprusMinutesTotal % 60;
          const cyprusTime = `${String(cyprusHours).padStart(2, '0')}:${String(cyprusMinutes).padStart(2, '0')}`;
          
          let matchesFrom = true;
          let matchesTo = true;
          
          if (timeFrom) matchesFrom = cyprusTime >= timeFrom;
          if (timeTo) matchesTo = cyprusTime <= timeTo;
          
          return matchesFrom && matchesTo;
        });
        
        console.log(`⏰ Time filtered: ${allCallDetails.length} calls remaining`);
      }
      
      // Sort by call start time (newest first)
      return allCallDetails.sort((a, b) => new Date(b.callStart).getTime() - new Date(a.callStart).getTime());
    } catch (error) {
      console.error('Error loading call details for multiple agents from external DB:', error);
      return [];
    }
  }

  async createCallDetail(insertDetail: InsertCallDetails): Promise<CallDetails> {
    throw new Error('Create operations not allowed on external read-only database');
  }

  // Project targets methods
  async getAllProjectTargets(): Promise<ProjectTargets[]> {
    return Array.from(this.projectTargets.values());
  }

  async getProjectTargets(projectId: string): Promise<ProjectTargets | undefined> {
    return Array.from(this.projectTargets.values()).find(target => target.projectId === projectId);
  }

  async saveProjectTargets(targets: Record<string, Omit<InsertProjectTargets, 'projectId'>>): Promise<void> {
    // Allow saving project targets locally (not persisted to external DB)
    for (const [projectId, targetData] of Object.entries(targets)) {
      const existingTarget = Array.from(this.projectTargets.values()).find(target => target.projectId === projectId);
      
      if (existingTarget) {
        existingTarget.targetValue = targetData.targetValue ?? 0;
        existingTarget.updatedAt = new Date();
        this.projectTargets.set(existingTarget.id, existingTarget);
      } else {
        const id = randomUUID();
        const newTarget: ProjectTargets = {
          id,
          projectId,
          targetValue: targetData.targetValue ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.projectTargets.set(id, newTarget);
      }
    }
  }

  async getProjectsWithCalls(filter: Pick<StatisticsFilter, 'agentIds' | 'dateFrom' | 'dateTo' | 'timeFrom' | 'timeTo'>): Promise<string[]> {
    await this.initializeData();
    
    if (!filter.agentIds || filter.agentIds.length === 0) {
      return [];
    }

    try {
      console.log(`🚀 OPTIMIZED: Using direct SQL query for projects with calls`);
      
      // Map agent IDs to user logins
      const agentNames = filter.agentIds
        .map(id => this.agents.get(id)?.name)
        .filter(Boolean) as string[];
      
      if (agentNames.length === 0) {
        console.log('❌ No valid agent names found for IDs:', filter.agentIds);
        return [];
      }

      // Build efficient direct query to agent_data view
      const projectsWithCalls = await this.getProjectsWithCallsDirectQuery({
        agentNames,
        dateFrom: filter.dateFrom,
        dateTo: filter.dateTo,
        timeFrom: filter.timeFrom,
        timeTo: filter.timeTo
      });

      console.log(`🚀 OPTIMIZED: Found ${projectsWithCalls.length} projects with calls for ${filter.agentIds.length} agent(s) in direct query`);
      return projectsWithCalls;
    } catch (error) {
      console.error('❌ Error in getProjectsWithCalls:', error);
      return [];
    }
  }

  private async getProjectsWithCallsDirectQuery(params: {
    agentNames: string[];
    dateFrom?: string;
    dateTo?: string;
    timeFrom?: string;
    timeTo?: string;
  }): Promise<string[]> {
    const { externalPool } = await import('./external-db');
    
    // Build the efficient SQL query as suggested by user
    let sql = `
      SELECT DISTINCT contacts_campaign_id 
      FROM agent_data 
      WHERE transactions_user_login = ANY($1)
    `;
    
    const queryParams: any[] = [params.agentNames];
    let paramIndex = 2;
    
    // Add date filtering
    if (params.dateFrom) {
      if (params.dateTo && params.dateTo !== params.dateFrom) {
        sql += ` AND transactions_fired_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(params.dateFrom, params.dateTo);
        paramIndex += 2;
      } else {
        sql += ` AND transactions_fired_date = $${paramIndex}`;
        queryParams.push(params.dateFrom);
        paramIndex += 1;
      }
    }
    
    // Add time filtering if provided
    if (params.timeFrom || params.timeTo) {
      if (params.timeFrom && params.timeTo) {
        sql += ` AND recordings_time BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(params.timeFrom, params.timeTo);
      } else if (params.timeFrom) {
        sql += ` AND recordings_time >= $${paramIndex}`;
        queryParams.push(params.timeFrom);
      } else if (params.timeTo) {
        sql += ` AND recordings_time <= $${paramIndex}`;
        queryParams.push(params.timeTo);
      }
    }
    
    console.log(`🚀 OPTIMIZED SQL:`, sql);
    console.log(`🚀 OPTIMIZED PARAMS:`, queryParams);
    
    try {
      if (!externalPool) {
        throw new Error("External database not configured");
      }
      const client = await externalPool.connect();
      let result;
      try {
        result = await client.query(sql, queryParams);
      } finally {
        client.release();
      }
      
      // Extract campaign IDs and convert them to project IDs
      const campaignIds = result.rows.map(row => row.contacts_campaign_id).filter(Boolean);
      
      // Map campaign IDs back to project IDs using our project mapping
      const projectIds = campaignIds
        .map(campaignId => {
          // Find project with matching name (campaign ID)
          const project = Array.from(this.projects.values()).find(p => p.name === campaignId);
          return project?.id;
        })
        .filter(Boolean) as string[];
      
      console.log(`🚀 OPTIMIZED: Mapped ${campaignIds.length} campaign IDs to ${projectIds.length} project IDs`);
      return projectIds;
    } catch (error) {
      console.error('❌ Error in direct query:', error);
      throw error;
    }
  }
}