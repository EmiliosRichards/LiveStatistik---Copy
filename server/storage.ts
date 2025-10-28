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
  type StatisticsFilter,
  agents,
  projects,
  callOutcomes,
  agentStatistics,
  callDetails,
  projectTargets
} from "@shared/schema";
import { randomUUID } from "crypto";
import { loadCSVData, getUniqueAgents, getUniqueProjects, type CSVRow } from "./csv-parser";
import { ExternalStorage } from "./external-storage";
import { db } from "./db";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // Agent methods
  getAgent(id: string): Promise<Agent | undefined>;
  getAllAgents(): Promise<Agent[]>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgentStatus(id: string, status: Agent['currentStatus']): Promise<void>;

  // Project methods
  getProject(id: string): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  getProjectsForAgents(agentIds: string[]): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;

  // Call outcome methods
  getAllCallOutcomes(): Promise<CallOutcome[]>;
  createCallOutcome(outcome: InsertCallOutcome): Promise<CallOutcome>;

  // Statistics methods
  getAgentStatistics(filter: StatisticsFilter): Promise<AgentStatistics[]>;
  createOrUpdateStatistics(stats: InsertAgentStatistics): Promise<AgentStatistics>;

  // Call details methods
  getCallDetails(agentId: string, projectId: string, dateFrom?: Date, dateTo?: Date, timeFrom?: string, timeTo?: string): Promise<CallDetails[]>;
  getCallDetailsForAgents(agentIds: string[], projectId: string, dateFrom?: Date, dateTo?: Date, timeFrom?: string, timeTo?: string): Promise<CallDetails[]>;
  createCallDetail(detail: InsertCallDetails): Promise<CallDetails>;

  // Project targets methods
  getAllProjectTargets(): Promise<ProjectTargets[]>;
  getProjectTargets(projectId: string): Promise<ProjectTargets | undefined>;
  saveProjectTargets(targets: Record<string, Omit<InsertProjectTargets, 'projectId'>>): Promise<void>;

  // Project availability methods
  getProjectsWithCalls(filter: Pick<StatisticsFilter, 'agentIds' | 'dateFrom' | 'dateTo' | 'timeFrom' | 'timeTo'>): Promise<string[]>;
}

export class MemStorage implements IStorage {
  private agents: Map<string, Agent>;
  private projects: Map<string, Project>;
  private callOutcomes: Map<string, CallOutcome>;
  private agentStatistics: Map<string, AgentStatistics>;
  private callDetails: Map<string, CallDetails>;
  private projectTargets: Map<string, ProjectTargets>;

  constructor() {
    this.agents = new Map();
    this.projects = new Map();
    this.callOutcomes = new Map();
    this.agentStatistics = new Map();
    this.callDetails = new Map();
    this.projectTargets = new Map();
    
    // Initialize with sample data
    this.initializeSampleData();
  }

  private initializeSampleData() {
    // Create agents
    const agentData = [
      { name: "Agent 01", currentStatus: 'im_gespraech' as const },
      { name: "Agent 02", currentStatus: 'nachbearbeitung' as const },
      { name: "Agent 03", currentStatus: 'vorbereitung' as const },
      { name: "Agent 04", currentStatus: 'wartet' as const },
      { name: "Agent 05", currentStatus: 'im_gespraech' as const },
      { name: "Agent 06", currentStatus: 'nachbearbeitung' as const },
      { name: "Agent 07", currentStatus: 'wartet' as const },
      { name: "Agent 08", currentStatus: 'vorbereitung' as const },
      { name: "Agent 09", currentStatus: 'im_gespraech' as const },
      { name: "Agent 10", currentStatus: 'wartet' as const },
    ];

    agentData.forEach(agent => {
      const id = randomUUID();
      this.agents.set(id, {
        id,
        ...agent,
        isActive: true,
        createdAt: new Date(),
      });
    });

    // Create projects
    const projectData = [
      { name: "Projekt 1" },
      { name: "Projekt 1.2" },
      { name: "Projekt 7" },
      { name: "Projekt 12" },
      { name: "Projekt 12.1" },
    ];

    projectData.forEach(project => {
      const id = randomUUID();
      this.projects.set(id, {
        id,
        ...project,
        isActive: true,
        createdAt: new Date(),
      });
    });

    // Create call outcomes
    const outcomeData = [
      { name: "KI Ansprechpartner", category: 'negative' as const, displayOrder: 1 },
      { name: "KI Gatekeeper", category: 'negative' as const, displayOrder: 2 },
      { name: "Partner vorhanden", category: 'negative' as const, displayOrder: 3 },
      { name: "falsche Zielgruppe", category: 'negative' as const, displayOrder: 4 },
      { name: "falsche Nummer", category: 'negative' as const, displayOrder: 5 },
      { name: "nicht mehr anrufen", category: 'negative' as const, displayOrder: 6 },
      { name: "Hotline", category: 'negative' as const, displayOrder: 7 },
      { name: "existiert nicht", category: 'negative' as const, displayOrder: 8 },
      { name: "Duplikat", category: 'negative' as const, displayOrder: 9 },
      { name: "Termin", category: 'positive' as const, displayOrder: 10 },
      { name: "Termin | Infomail", category: 'positive' as const, displayOrder: 11 },
      { name: "selbst gebucht", category: 'positive' as const, displayOrder: 12 },
    ];

    outcomeData.forEach(outcome => {
      const id = randomUUID();
      this.callOutcomes.set(id, {
        id,
        ...outcome,
      });
    });
  }

  // Agent methods
  async getAgent(id: string): Promise<Agent | undefined> {
    return this.agents.get(id);
  }

  async getAllAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    const id = randomUUID();
    const agent: Agent = { 
      id,
      name: insertAgent.name,
      isActive: insertAgent.isActive ?? true,
      currentStatus: (insertAgent.currentStatus ?? 'wartet') as Agent['currentStatus'],
      createdAt: new Date(),
    };
    this.agents.set(id, agent);
    return agent;
  }

  async updateAgentStatus(id: string, status: Agent['currentStatus']): Promise<void> {
    const agent = this.agents.get(id);
    if (agent) {
      this.agents.set(id, { ...agent, currentStatus: status });
    }
  }

  // Project methods
  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProjectsForAgents(agentIds: string[]): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = { 
      id,
      name: insertProject.name,
      isActive: insertProject.isActive ?? true,
      createdAt: new Date(),
    };
    this.projects.set(id, project);
    return project;
  }

  // Call outcome methods
  async getAllCallOutcomes(): Promise<CallOutcome[]> {
    return Array.from(this.callOutcomes.values()).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async createCallOutcome(insertOutcome: InsertCallOutcome): Promise<CallOutcome> {
    const id = randomUUID();
    const outcome: CallOutcome = { 
      id,
      name: insertOutcome.name,
      category: insertOutcome.category as CallOutcome['category'],
      displayOrder: insertOutcome.displayOrder ?? 0
    };
    this.callOutcomes.set(id, outcome);
    return outcome;
  }

  // Statistics methods
  async getAgentStatistics(filter: StatisticsFilter): Promise<AgentStatistics[]> {
    let stats = Array.from(this.agentStatistics.values());
    
    // Apply filters
    if (filter.agentIds && filter.agentIds.length > 0) {
      stats = stats.filter(stat => filter.agentIds!.includes(stat.agentId));
    }
    
    if (filter.projectIds && filter.projectIds.length > 0) {
      stats = stats.filter(stat => filter.projectIds!.includes(stat.projectId));
    }
    
    // Single date filter (legacy)
    if (filter.date) {
      const filterDate = new Date(filter.date);
      stats = stats.filter(stat => {
        const statDate = new Date(stat.date);
        return statDate.toDateString() === filterDate.toDateString();
      });
    }
    
    // Date range filter
    if (filter.dateFrom || filter.dateTo) {
      stats = stats.filter(stat => {
        const statDate = new Date(stat.date);
        let matchesFrom = true;
        let matchesTo = true;
        
        if (filter.dateFrom) {
          const fromDate = new Date(filter.dateFrom);
          
          // If only dateFrom is provided (no dateTo or empty dateTo), filter for exact day only
          if (!filter.dateTo || filter.dateTo.trim() === '') {
            return statDate.toDateString() === fromDate.toDateString();
          }
          
          matchesFrom = statDate >= fromDate;
        }
        
        if (filter.dateTo) {
          const toDate = new Date(filter.dateTo);
          // Include the entire day by setting time to end of day
          toDate.setHours(23, 59, 59, 999);
          matchesTo = statDate <= toDate;
        }
        
        return matchesFrom && matchesTo;
      });
    }
    
    return stats;
  }

  async createOrUpdateStatistics(insertStats: InsertAgentStatistics): Promise<AgentStatistics> {
    const id = randomUUID();
    const stats: AgentStatistics = { 
      id,
      agentId: insertStats.agentId,
      projectId: insertStats.projectId,
      date: insertStats.date,
      anzahl: insertStats.anzahl ?? 0,
      abgeschlossen: insertStats.abgeschlossen ?? 0,
      erfolgreich: insertStats.erfolgreich ?? 0,
      wartezeit: insertStats.wartezeit ?? 0,
      gespraechszeit: insertStats.gespraechszeit ?? 0,
      nachbearbeitungszeit: insertStats.nachbearbeitungszeit ?? 0,
      vorbereitungszeit: insertStats.vorbereitungszeit ?? 0,
      erfolgProStunde: insertStats.erfolgProStunde ?? 0,
      arbeitszeit: insertStats.arbeitszeit ?? 0,
      outcomes: insertStats.outcomes ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.agentStatistics.set(id, stats);
    return stats;
  }

  // Call details methods
  async getCallDetails(agentId: string, projectId: string, dateFrom?: Date, dateTo?: Date): Promise<CallDetails[]> {
    let details = Array.from(this.callDetails.values())
      .filter(detail => detail.agentId === agentId && detail.projectId === projectId);
    
    if (dateFrom && dateTo) {
      details = details.filter(detail => {
        const callDate = new Date(detail.callStart);
        return callDate >= dateFrom && callDate <= dateTo;
      });
    }
    
    return details.sort((a, b) => new Date(b.callStart).getTime() - new Date(a.callStart).getTime());
  }

  async getCallDetailsForAgents(agentIds: string[], projectId: string, dateFrom?: Date, dateTo?: Date, timeFrom?: string, timeTo?: string): Promise<CallDetails[]> {
    let details = Array.from(this.callDetails.values())
      .filter(detail => agentIds.includes(detail.agentId) && detail.projectId === projectId);
    
    if (dateFrom && dateTo) {
      details = details.filter(detail => {
        const callDate = new Date(detail.callStart);
        return callDate >= dateFrom && callDate <= dateTo;
      });
    }
    
    return details.sort((a, b) => new Date(b.callStart).getTime() - new Date(a.callStart).getTime());
  }

  async createCallDetail(insertDetail: InsertCallDetails): Promise<CallDetails> {
    const id = randomUUID();
    const detail: CallDetails = { 
      id,
      agentId: insertDetail.agentId,
      projectId: insertDetail.projectId,
      contactName: insertDetail.contactName ?? null,
      contactPerson: null,
      contactNumber: insertDetail.contactNumber ?? null,
      callStart: insertDetail.callStart,
      callEnd: insertDetail.callEnd ?? null,
      duration: insertDetail.duration ?? null,
      outcome: insertDetail.outcome,
      outcomeCategory: insertDetail.outcomeCategory as CallDetails['outcomeCategory'],
      recordingUrl: insertDetail.recordingUrl ?? null,
      notes: insertDetail.notes ?? null,
      wrapupTimeSeconds: null,
      waitTimeSeconds: null,
      editTimeSeconds: null,
      contactsId: null,
      contactsCampaignId: null,
      recordingsDate: null,
      groupId: null,
      createdAt: new Date(),
    };
    this.callDetails.set(id, detail);
    return detail;
  }

  // Project targets methods - missing implementation
  async getAllProjectTargets(): Promise<ProjectTargets[]> {
    return Array.from(this.projectTargets.values());
  }

  async getProjectTargets(projectId: string): Promise<ProjectTargets | undefined> {
    return Array.from(this.projectTargets.values()).find(target => target.projectId === projectId);
  }

  async saveProjectTargets(targets: Record<string, Omit<InsertProjectTargets, 'projectId'>>): Promise<void> {
    for (const [projectId, targetData] of Object.entries(targets)) {
      // Find existing target for this project
      const existingTarget = Array.from(this.projectTargets.values()).find(target => target.projectId === projectId);
      
      if (existingTarget) {
        // Update existing target
        existingTarget.targetValue = targetData.targetValue ?? 0;
        existingTarget.updatedAt = new Date();
        this.projectTargets.set(existingTarget.id, existingTarget);
      } else {
        // Create new target
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
    // Stub implementation - returns all project IDs
    return Array.from(this.projects.keys());
  }
}

// CSV-based storage that loads data dynamically from CSV file
export class CSVStorage implements IStorage {
  private csvData: CSVRow[] = [];
  private agents: Map<string, Agent> = new Map();
  private projects: Map<string, Project> = new Map();
  private callOutcomes: Map<string, CallOutcome> = new Map();
  private agentStatistics: Map<string, AgentStatistics> = new Map();
  private callDetails: Map<string, CallDetails> = new Map();
  private projectTargets: Map<string, ProjectTargets> = new Map();

  constructor() {
    this.loadDataFromCSV();
    this.initializeCallOutcomes();
  }

  private loadDataFromCSV() {
    this.csvData = loadCSVData();
    this.generateAgentsFromCSV();
    this.generateProjectsFromCSV();
    this.generateStatisticsFromCSV();
  }

  private generateAgentsFromCSV() {
    const uniqueAgents = getUniqueAgents(this.csvData);
    uniqueAgents.forEach(agentName => {
      const id = randomUUID();
      this.agents.set(id, {
        id,
        name: agentName,
        isActive: true,
        currentStatus: 'wartet' as Agent['currentStatus'],
        createdAt: new Date(),
      });
    });
  }

  private generateProjectsFromCSV() {
    const uniqueProjects = getUniqueProjects(this.csvData);
    uniqueProjects.forEach(projectName => {
      const id = randomUUID();
      this.projects.set(id, {
        id,
        name: projectName,
        isActive: true,
        createdAt: new Date(),
      });
    });
  }

  private generateStatisticsFromCSV() {
    this.csvData.forEach(row => {
      // Find matching agent and project IDs
      const agent = Array.from(this.agents.values()).find(a => a.name === row.Agent);
      const project = Array.from(this.projects.values()).find(p => p.name === row.Projekt);
      
      if (agent && project) {
        const id = randomUUID();
        // Parse German date format (DD.MM.YYYY)
        const dateParts = row.Datum.split('.');
        const parsedDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[1]) - 1, parseInt(dateParts[0]));
        
        // Generate sample outcomes based on abgeschlossen count
        const sampleOutcomes: Record<string, number> = {};
        if (row.abgeschlossen > 0) {
          // Distribute the abgeschlossen count across different outcomes
          const negativeCount = row.abgeschlossen - row.erfolgreich;
          const positiveCount = row.erfolgreich;
          
          // Sample distribution for negative outcomes
          if (negativeCount > 0) {
            sampleOutcomes["KI Ansprechpartner"] = Math.floor(negativeCount * 0.2);
            sampleOutcomes["falsche Zielgruppe"] = Math.floor(negativeCount * 0.15);
            sampleOutcomes["Partner vorhanden"] = Math.floor(negativeCount * 0.15);
            sampleOutcomes["nicht mehr anrufen"] = Math.floor(negativeCount * 0.1);
            sampleOutcomes["KI Gatekeeper"] = Math.floor(negativeCount * 0.1);
            sampleOutcomes["falsche Nummer"] = Math.floor(negativeCount * 0.1);
            sampleOutcomes["Hotline"] = Math.floor(negativeCount * 0.1);
            sampleOutcomes["existiert nicht"] = Math.floor(negativeCount * 0.05);
            sampleOutcomes["Duplikat"] = negativeCount - Object.values(sampleOutcomes).reduce((a, b) => a + b, 0);
          }
          
          // Sample distribution for positive outcomes
          if (positiveCount > 0) {
            sampleOutcomes["Termin"] = Math.floor(positiveCount * 0.5);
            sampleOutcomes["Termin | Infomail"] = Math.floor(positiveCount * 0.3);
            sampleOutcomes["selbst gebucht"] = positiveCount - sampleOutcomes["Termin"] - (sampleOutcomes["Termin | Infomail"] || 0);
          }
        }
        
        this.agentStatistics.set(id, {
          id,
          agentId: agent.id,
          projectId: project.id,
          date: parsedDate,
          anzahl: row.Anzahl,
          abgeschlossen: row.abgeschlossen,
          erfolgreich: row.erfolgreich,
          wartezeit: row['WZ/h'],
          // Convert hours to minutes for internal consistency if frontend expects minutes
          gespraechszeit: Math.round((row['GZ/h'] || 0) * 60),
          nachbearbeitungszeit: row['NBZ/h'],
          vorbereitungszeit: row['VBZ/h'],
          erfolgProStunde: row['Erfolg/h'],
          arbeitszeit: row['AZ/h'],
          outcomes: sampleOutcomes,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });
  }

  private initializeCallOutcomes() {
    const outcomeData = [
      { name: "KI Ansprechpartner", category: 'negative' as const, displayOrder: 1 },
      { name: "KI Gatekeeper", category: 'negative' as const, displayOrder: 2 },
      { name: "Partner vorhanden", category: 'negative' as const, displayOrder: 3 },
      { name: "falsche Zielgruppe", category: 'negative' as const, displayOrder: 4 },
      { name: "falsche Nummer", category: 'negative' as const, displayOrder: 5 },
      { name: "nicht mehr anrufen", category: 'negative' as const, displayOrder: 6 },
      { name: "Hotline", category: 'negative' as const, displayOrder: 7 },
      { name: "existiert nicht", category: 'negative' as const, displayOrder: 8 },
      { name: "Duplikat", category: 'negative' as const, displayOrder: 9 },
      { name: "Termin", category: 'positive' as const, displayOrder: 10 },
      { name: "Termin | Infomail", category: 'positive' as const, displayOrder: 11 },
      { name: "selbst gebucht", category: 'positive' as const, displayOrder: 12 },
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

  // Agent methods
  async getAgent(id: string): Promise<Agent | undefined> {
    return this.agents.get(id);
  }

  async getAllAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    const id = randomUUID();
    const agent: Agent = { 
      id,
      name: insertAgent.name,
      isActive: insertAgent.isActive ?? true,
      currentStatus: (insertAgent.currentStatus ?? 'wartet') as Agent['currentStatus'],
      createdAt: new Date(),
    };
    this.agents.set(id, agent);
    return agent;
  }

  async updateAgentStatus(id: string, status: Agent['currentStatus']): Promise<void> {
    const agent = this.agents.get(id);
    if (agent) {
      this.agents.set(id, { ...agent, currentStatus: status });
    }
  }

  // Project methods
  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProjectsForAgents(agentIds: string[]): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = { 
      id,
      name: insertProject.name,
      isActive: insertProject.isActive ?? true,
      createdAt: new Date(),
    };
    this.projects.set(id, project);
    return project;
  }

  // Call outcome methods
  async getAllCallOutcomes(): Promise<CallOutcome[]> {
    return Array.from(this.callOutcomes.values()).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async createCallOutcome(insertOutcome: InsertCallOutcome): Promise<CallOutcome> {
    const id = randomUUID();
    const outcome: CallOutcome = { 
      id,
      name: insertOutcome.name,
      category: insertOutcome.category as CallOutcome['category'],
      displayOrder: insertOutcome.displayOrder ?? 0
    };
    this.callOutcomes.set(id, outcome);
    return outcome;
  }

  // Statistics methods
  async getAgentStatistics(filter: StatisticsFilter): Promise<AgentStatistics[]> {
    let stats = Array.from(this.agentStatistics.values());
    
    // Apply filters
    if (filter.agentIds && filter.agentIds.length > 0) {
      stats = stats.filter(stat => filter.agentIds!.includes(stat.agentId));
    }
    
    if (filter.projectIds && filter.projectIds.length > 0) {
      stats = stats.filter(stat => filter.projectIds!.includes(stat.projectId));
    }
    
    // Single date filter (legacy)
    if (filter.date) {
      const filterDate = new Date(filter.date);
      stats = stats.filter(stat => {
        const statDate = new Date(stat.date);
        return statDate.toDateString() === filterDate.toDateString();
      });
    }
    
    // Date range filter
    if (filter.dateFrom || filter.dateTo) {
      stats = stats.filter(stat => {
        const statDate = new Date(stat.date);
        let matchesFrom = true;
        let matchesTo = true;
        
        if (filter.dateFrom) {
          const fromDate = new Date(filter.dateFrom);
          
          // If only dateFrom is provided (no dateTo or empty dateTo), filter for exact day only
          if (!filter.dateTo || filter.dateTo.trim() === '') {
            return statDate.toDateString() === fromDate.toDateString();
          }
          
          matchesFrom = statDate >= fromDate;
        }
        
        if (filter.dateTo) {
          const toDate = new Date(filter.dateTo);
          // Include the entire day by setting time to end of day
          toDate.setHours(23, 59, 59, 999);
          matchesTo = statDate <= toDate;
        }
        
        return matchesFrom && matchesTo;
      });
    }
    
    return stats;
  }

  async createOrUpdateStatistics(insertStats: InsertAgentStatistics): Promise<AgentStatistics> {
    const id = randomUUID();
    const stats: AgentStatistics = { 
      id,
      agentId: insertStats.agentId,
      projectId: insertStats.projectId,
      date: insertStats.date,
      anzahl: insertStats.anzahl ?? 0,
      abgeschlossen: insertStats.abgeschlossen ?? 0,
      erfolgreich: insertStats.erfolgreich ?? 0,
      wartezeit: insertStats.wartezeit ?? 0,
      gespraechszeit: insertStats.gespraechszeit ?? 0,
      nachbearbeitungszeit: insertStats.nachbearbeitungszeit ?? 0,
      vorbereitungszeit: insertStats.vorbereitungszeit ?? 0,
      erfolgProStunde: insertStats.erfolgProStunde ?? 0,
      arbeitszeit: insertStats.arbeitszeit ?? 0,
      outcomes: insertStats.outcomes ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.agentStatistics.set(id, stats);
    return stats;
  }

  // Call details methods
  async getCallDetails(agentId: string, projectId: string, dateFrom?: Date, dateTo?: Date): Promise<CallDetails[]> {
    let details = Array.from(this.callDetails.values())
      .filter(detail => detail.agentId === agentId && detail.projectId === projectId);
    
    if (dateFrom && dateTo) {
      details = details.filter(detail => {
        const callDate = new Date(detail.callStart);
        return callDate >= dateFrom && callDate <= dateTo;
      });
    }
    
    return details.sort((a, b) => new Date(b.callStart).getTime() - new Date(a.callStart).getTime());
  }

  async getCallDetailsForAgents(agentIds: string[], projectId: string, dateFrom?: Date, dateTo?: Date, timeFrom?: string, timeTo?: string): Promise<CallDetails[]> {
    let details = Array.from(this.callDetails.values())
      .filter(detail => agentIds.includes(detail.agentId) && detail.projectId === projectId);
    
    if (dateFrom && dateTo) {
      details = details.filter(detail => {
        const callDate = new Date(detail.callStart);
        return callDate >= dateFrom && callDate <= dateTo;
      });
    }
    
    return details.sort((a, b) => new Date(b.callStart).getTime() - new Date(a.callStart).getTime());
  }

  async createCallDetail(insertDetail: InsertCallDetails): Promise<CallDetails> {
    const id = randomUUID();
    const detail: CallDetails = { 
      id,
      agentId: insertDetail.agentId,
      projectId: insertDetail.projectId,
      contactName: insertDetail.contactName ?? null,
      contactPerson: null,
      contactNumber: insertDetail.contactNumber ?? null,
      callStart: insertDetail.callStart,
      callEnd: insertDetail.callEnd ?? null,
      duration: insertDetail.duration ?? null,
      outcome: insertDetail.outcome,
      outcomeCategory: insertDetail.outcomeCategory as CallDetails['outcomeCategory'],
      recordingUrl: insertDetail.recordingUrl ?? null,
      notes: insertDetail.notes ?? null,
      wrapupTimeSeconds: null,
      waitTimeSeconds: null,
      editTimeSeconds: null,
      contactsId: null,
      contactsCampaignId: null,
      recordingsDate: null,
      groupId: null,
      createdAt: new Date(),
    };
    this.callDetails.set(id, detail);
    return detail;
  }

  // Project targets methods
  async getAllProjectTargets(): Promise<ProjectTargets[]> {
    return Array.from(this.projectTargets.values());
  }

  async getProjectTargets(projectId: string): Promise<ProjectTargets | undefined> {
    return Array.from(this.projectTargets.values()).find(target => target.projectId === projectId);
  }

  async saveProjectTargets(targets: Record<string, Omit<InsertProjectTargets, 'projectId'>>): Promise<void> {
    for (const [projectId, targetData] of Object.entries(targets)) {
      // Find existing target for this project
      const existingTarget = Array.from(this.projectTargets.values()).find(target => target.projectId === projectId);
      
      if (existingTarget) {
        // Update existing target
        existingTarget.targetValue = targetData.targetValue ?? 0;
        existingTarget.updatedAt = new Date();
        this.projectTargets.set(existingTarget.id, existingTarget);
      } else {
        // Create new target
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
    // Stub implementation - returns all project IDs
    return Array.from(this.projects.keys());
  }
}

// Database-based storage implementation
export class DatabaseStorage implements IStorage {
  // Agent methods
  async getAgent(id: string): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent || undefined;
  }

  async getAllAgents(): Promise<Agent[]> {
    return await db.select().from(agents).orderBy(agents.name);
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    const [agent] = await db
      .insert(agents)
      .values([{
        name: insertAgent.name,
        isActive: insertAgent.isActive ?? true,
        currentStatus: (insertAgent.currentStatus ?? 'wartet') as Agent['currentStatus']
      }])
      .returning();
    return agent;
  }

  async updateAgentStatus(id: string, status: Agent['currentStatus']): Promise<void> {
    await db
      .update(agents)
      .set({ currentStatus: status })
      .where(eq(agents.id, id));
  }

  // Project methods
  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || undefined;
  }

  async getAllProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(projects.name);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db
      .insert(projects)
      .values(insertProject)
      .returning();
    return project;
  }

  async getProjectsForAgents(agentIds: string[]): Promise<Project[]> {
    // Stub implementation - returns all projects
    return await this.getAllProjects();
  }

  // Call outcome methods
  async getAllCallOutcomes(): Promise<CallOutcome[]> {
    return await db.select().from(callOutcomes).orderBy(callOutcomes.displayOrder);
  }

  async createCallOutcome(insertOutcome: InsertCallOutcome): Promise<CallOutcome> {
    const [outcome] = await db
      .insert(callOutcomes)
      .values([{
        name: insertOutcome.name,
        category: insertOutcome.category as CallOutcome['category'],
        displayOrder: insertOutcome.displayOrder ?? 0
      }])
      .returning();
    return outcome;
  }

  // Statistics methods
  async getAgentStatistics(filter: StatisticsFilter): Promise<AgentStatistics[]> {
    let query = db.select().from(agentStatistics);
    
    // Build where conditions
    const conditions = [];
    
    if (filter.agentIds && filter.agentIds.length > 0) {
      conditions.push(sql`${agentStatistics.agentId} = ANY(${filter.agentIds})`);
    }
    
    if (filter.projectIds && filter.projectIds.length > 0) {
      conditions.push(sql`${agentStatistics.projectId} = ANY(${filter.projectIds})`);
    }
    
    // Date filtering
    if (filter.date) {
      const filterDate = new Date(filter.date);
      const startOfDay = new Date(filterDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filterDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      conditions.push(gte(agentStatistics.date, startOfDay));
      conditions.push(lte(agentStatistics.date, endOfDay));
    }
    
    if (filter.dateFrom) {
      const fromDate = new Date(filter.dateFrom);
      if (!filter.dateTo || filter.dateTo.trim() === '') {
        // Single day filter
        const startOfDay = new Date(fromDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(fromDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        conditions.push(gte(agentStatistics.date, startOfDay));
        conditions.push(lte(agentStatistics.date, endOfDay));
      } else {
        conditions.push(gte(agentStatistics.date, fromDate));
      }
    }
    
    if (filter.dateTo) {
      const toDate = new Date(filter.dateTo);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(agentStatistics.date, toDate));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query;
  }

  async createOrUpdateStatistics(insertStats: InsertAgentStatistics): Promise<AgentStatistics> {
    const [stats] = await db
      .insert(agentStatistics)
      .values({
        ...insertStats,
        updatedAt: new Date(),
      })
      .returning();
    return stats;
  }

  // Call details methods
  async getCallDetails(agentId: string, projectId: string, dateFrom?: Date, dateTo?: Date): Promise<CallDetails[]> {
    const baseConditions = [
      eq(callDetails.agentId, agentId),
      eq(callDetails.projectId, projectId)
    ];
    
    if (dateFrom && dateTo) {
      baseConditions.push(gte(callDetails.callStart, dateFrom));
      baseConditions.push(lte(callDetails.callStart, dateTo));
    }
    
    const results = await db.select().from(callDetails)
      .where(and(...baseConditions));
    
    return results.sort((a: CallDetails, b: CallDetails) => new Date(b.callStart).getTime() - new Date(a.callStart).getTime());
  }

  async getCallDetailsForAgents(agentIds: string[], projectId: string, dateFrom?: Date, dateTo?: Date, timeFrom?: string, timeTo?: string): Promise<CallDetails[]> {
    const baseConditions = [
      sql`${callDetails.agentId} = ANY(${agentIds})`,
      eq(callDetails.projectId, projectId)
    ];
    
    if (dateFrom && dateTo) {
      baseConditions.push(gte(callDetails.callStart, dateFrom));
      baseConditions.push(lte(callDetails.callStart, dateTo));
    }
    
    const results = await db.select().from(callDetails)
      .where(and(...baseConditions));
    
    return results.sort((a: CallDetails, b: CallDetails) => new Date(b.callStart).getTime() - new Date(a.callStart).getTime());
  }

  async createCallDetail(insertDetail: InsertCallDetails): Promise<CallDetails> {
    const [detail] = await db
      .insert(callDetails)
      .values([{
        agentId: insertDetail.agentId,
        projectId: insertDetail.projectId,
        contactName: insertDetail.contactName,
        contactNumber: insertDetail.contactNumber,
        callStart: insertDetail.callStart,
        callEnd: insertDetail.callEnd,
        duration: insertDetail.duration,
        outcome: insertDetail.outcome,
        outcomeCategory: insertDetail.outcomeCategory as CallDetails['outcomeCategory'],
        recordingUrl: insertDetail.recordingUrl,
        notes: insertDetail.notes
      }])
      .returning();
    return detail;
  }

  // Project targets methods
  async getAllProjectTargets(): Promise<ProjectTargets[]> {
    return await db.select().from(projectTargets);
  }

  async getProjectTargets(projectId: string): Promise<ProjectTargets | undefined> {
    const [target] = await db.select().from(projectTargets)
      .where(eq(projectTargets.projectId, projectId));
    return target || undefined;
  }

  async saveProjectTargets(targets: Record<string, Omit<InsertProjectTargets, 'projectId'>>): Promise<void> {
    for (const [projectId, targetData] of Object.entries(targets)) {
      // Check if target exists
      const existingTarget = await this.getProjectTargets(projectId);
      
      if (existingTarget) {
        // Update existing target
        await db
          .update(projectTargets)
          .set({
            targetValue: targetData.targetValue ?? 0,
            updatedAt: new Date(),
          })
          .where(eq(projectTargets.projectId, projectId));
      } else {
        // Create new target
        await db
          .insert(projectTargets)
          .values({
            projectId,
            targetValue: targetData.targetValue ?? 0,
          });
      }
    }
  }

  async getProjectsWithCalls(filter: Pick<StatisticsFilter, 'agentIds' | 'dateFrom' | 'dateTo' | 'timeFrom' | 'timeTo'>): Promise<string[]> {
    // Stub implementation - returns all project IDs
    const allProjects = await this.getAllProjects();
    return allProjects.map(p => p.id);
  }
}

// Use external database storage for real data
export const storage = new ExternalStorage();

// Keep CSV storage for reference/fallback
// export const storage = new CSVStorage();
