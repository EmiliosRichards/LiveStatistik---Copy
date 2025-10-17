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
import { IStorage } from "./storage";
import { 
  externalPool, 
  getUniqueAgents, 
  getUniqueCampaigns, 
  getCampaignAgentReference,
  getAgentData,
  getAgentCallDetails,
  type AgentData,
  type CampaignAgentReference
} from "./external-db";

export class ExternalStorage implements IStorage {
  private agents: Map<string, Agent> = new Map();
  private projects: Map<string, Project> = new Map();
  private callOutcomes: Map<string, CallOutcome> = new Map();
  private agentStatistics: Map<string, AgentStatistics> = new Map();
  private callDetails: Map<string, CallDetails> = new Map();
  private projectTargets: Map<string, ProjectTargets> = new Map();
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  
  // Test system für Live-Benachrichtigungen
  // REMOVED: Test system variables komplett entfernt auf Benutzeranfrage

  constructor() {
    // Don't initialize immediately, wait for first request
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
    }
    
    // Try to load projects with error handling
    try {
      await this.loadProjectsFromExternal();
      projectsLoaded = true;
    } catch (error) {
      console.error('❌ Error loading projects from external DB:', error);
    }
    
    // Always load call outcomes (these are static)
    this.initializeCallOutcomes();
    
    // If either failed, don't show any data - only real data or nothing
    if (!agentsLoaded || !projectsLoaded) {
      console.error('❌ Database connection failed - no data will be displayed');
      console.log('ℹ️ System will show empty state until database connection is restored');
      // Keep maps empty - no fallback data
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
      const id = randomUUID();
      this.agents.set(id, {
        id,
        name: agentLogin.trim(), // Use the login as display name, trimmed
        isActive: true,
        currentStatus: 'wartet' as Agent['currentStatus'],
        createdAt: new Date(),
      });
    });
    
    console.log(`✅ Loaded ${this.agents.size} unique agents (removed duplicates)`);
  }

  private async loadProjectsFromExternal() {
    const uniqueCampaigns = await getUniqueCampaigns();
    console.log(`📊 Found ${uniqueCampaigns.length} unique campaigns in external database`);
    
    // Clear existing projects to prevent duplicates
    this.projects.clear();
    
    // Create a Set to ensure uniqueness
    const uniqueCampaignSet = new Set(uniqueCampaigns.filter(campaign => campaign && campaign.trim() !== ''));
    
    uniqueCampaignSet.forEach(campaignId => {
      const id = randomUUID();
      this.projects.set(id, {
        id,
        name: campaignId.trim(), // Use campaign ID as project name, trimmed
        isActive: true,
        createdAt: new Date(),
      });
    });
    
    console.log(`✅ Loaded ${this.projects.size} unique projects (removed duplicates)`);
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
      
      // Convert duration from milliseconds to hours
      const durationHours = parseInt(record.connections_duration.toString()) / (1000 * 60 * 60);
      stat.gespraechszeit += durationHours;
      
      // Convert waiting time from seconds to hours (WZ)
      if (record.transactions_wait_time_sec) {
        const waitingTimeHours = record.transactions_wait_time_sec / 3600; // Convert seconds to hours
        stat.wartezeit += waitingTimeHours;
      }
      
      // Convert edit time from seconds to hours (NBZ - Nachbearbeitungszeit)
      if (record.transactions_edit_time_sec) {
        const editTimeHours = record.transactions_edit_time_sec / 3600; // Convert seconds to hours
        stat.nachbearbeitungszeit += editTimeHours;
      }
      
      // Convert pause time from seconds to hours (VBZ - Vorbereitungszeit)
      if (record.transactions_pause_time_sec) {
        const pauseTimeHours = record.transactions_pause_time_sec / 3600; // Convert seconds to hours
        stat.vorbereitungszeit += pauseTimeHours;
      }
      
      // Calculate total work time (AZ) from all time components for this record
      // AZ = WZ + GZ + NBZ + VBZ (all converted to hours)
      const recordWorkTimeHours = 
        (record.transactions_wait_time_sec || 0) / 3600 + 
        durationHours + // GZ already in hours
        (record.transactions_edit_time_sec || 0) / 3600 + // NBZ
        (record.transactions_pause_time_sec || 0) / 3600; // VBZ
      stat.arbeitszeit += recordWorkTimeHours;


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
        console.log(`🚀 OPTIMIZED: Received ${externalData.length} pre-filtered records from single DB query`);
        
        // Convert external data to statistics format efficiently
        const allStats = await this.convertExternalDataToStatistics(externalData, filter);
        
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
      
      // Time range filter (convert to UTC for DB query)
      if (timeFrom || timeTo) {
        if (timeFrom) {
          // Convert Cyprus time to UTC (-3 hours) for DB comparison
          const [hours, minutes] = timeFrom.split(':').map(Number);
          const utcHours = (hours - 3 + 24) % 24;
          const utcTimeFrom = `${utcHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          conditions.push(`SUBSTRING(recordings_start_time, 12, 5) >= $${params.length + 1}`);
          params.push(utcTimeFrom);
        }
        if (timeTo) {
          // Convert Cyprus time to UTC (-3 hours) for DB comparison
          const [hours, minutes] = timeTo.split(':').map(Number);
          const utcHours = (hours - 3 + 24) % 24;
          const utcTimeTo = `${utcHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          conditions.push(`SUBSTRING(recordings_start_time, 12, 5) <= $${params.length + 1}`);
          params.push(utcTimeTo);
        }
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Use DISTINCT ON for deduplication with performance limit
      const query = `
        SELECT DISTINCT ON (transaction_id) *
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

  // Simple helper method to get agent statistics
  async getAgentStatistics(filter: StatisticsFilter): Promise<AgentStatistics[]> {
    try {
      // Initialize data first
      await this.initializeData();
      
      // Use the optimized function from external-storage-simple.ts
      const { getOptimizedAgentStatistics } = await import('./external-storage-simple');
      return await getOptimizedAgentStatistics(this.agents, this.projects, filter);
    } catch (error) {
      console.error('Error in getAgentStatistics:', error);
      return [];
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
      
      const { getAgentCallDetails } = await import('./external-db.js');
      console.log(`🔍 Calling getAgentCallDetails with: agent="${realAgentName}", project="${realProjectName}", dateFrom="${dateFromStr}", dateTo="${dateToStr}"`);
      const filteredData = await getAgentCallDetails(realAgentName!, realProjectName!, dateFromStr, dateToStr, 10000);
      
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
        
        
        // Create unique ID per row (includes index to avoid collisions)
        const uniqueKey = `${record.contacts_id}_${record.contacts_campaign_id}_${record.transactions_fired_date}_${index}`.replace(/[^a-zA-Z0-9]/g, '_');
        const fallbackId = createHash('md5').update(uniqueKey).digest('hex').substring(0, 8);
        
        // CRITICAL FIX: Always use transaction_id if available, otherwise create guaranteed unique ID
        const uniqueId = record.transaction_id || `fallback_${fallbackId}_${index}`;
        
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