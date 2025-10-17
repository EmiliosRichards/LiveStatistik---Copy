import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Agent table
export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  currentStatus: text("current_status").$type<'im_gespraech' | 'nachbearbeitung' | 'vorbereitung' | 'wartet'>().default('wartet'),
  createdAt: timestamp("created_at").defaultNow(),
});

// Project table
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Call outcomes enumeration
export const callOutcomes = pgTable("call_outcomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").$type<'positive' | 'negative' | 'offen'>().notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

// Agent statistics data
export const agentStatistics = pgTable("agent_statistics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().references(() => agents.id),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  date: timestamp("date").notNull(),
  
  // Core metrics
  anzahl: integer("anzahl").notNull().default(0), // Total calls attempted
  abgeschlossen: integer("abgeschlossen").notNull().default(0), // Completed calls
  erfolgreich: integer("erfolgreich").notNull().default(0), // Successful calls
  
  // Time metrics (in hours)
  wartezeit: integer("wartezeit").notNull().default(0), // Wait time in minutes
  gespraechszeit: integer("gespraechszeit").notNull().default(0), // Talk time in minutes  
  nachbearbeitungszeit: integer("nachbearbeitungszeit").notNull().default(0), // Post-processing time in minutes
  vorbereitungszeit: integer("vorbereitungszeit").notNull().default(0), // Preparation time in minutes
  erfolgProStunde: integer("erfolg_pro_stunde").notNull().default(0), // Success per hour
  arbeitszeit: integer("arbeitszeit").notNull().default(0), // Total work time in minutes
  
  // Detailed outcomes breakdown
  outcomes: jsonb("outcomes").$type<Record<string, number>>().default({}),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Call details for individual calls
export const callDetails = pgTable("call_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().references(() => agents.id),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  contactName: text("contact_name"),
  contactPerson: text("contact_person"),
  contactNumber: text("contact_number"),
  callStart: timestamp("call_start").notNull(),
  callEnd: timestamp("call_end"),
  duration: integer("duration"), // in seconds
  outcome: text("outcome").notNull(),
  outcomeCategory: text("outcome_category").$type<'positive' | 'negative' | 'offen'>().notNull(),
  recordingUrl: text("recording_url"),
  notes: text("notes"),
  // Test columns for real agent data
  wrapupTimeSeconds: integer("wrapup_time_seconds"), // NBZ (s) - transactions_wrapup_time_sec  
  waitTimeSeconds: integer("wait_time_seconds"), // WZ (s) - transactions_wait_time_sec
  editTimeSeconds: integer("edit_time_seconds"), // VBZ (s) - transactions_edit_time_sec
  // Grouping fields for call aggregation
  contactsId: text("contacts_id"), // From contacts_id in agent_data view
  contactsCampaignId: text("contacts_campaign_id"), // From contacts_campaign_id in agent_data view
  recordingsDate: text("transactions_fired_date"), // Date part from transactions_fired_date for grouping
  groupId: text("group_id"), // Shared ID for calls that should be grouped together
  createdAt: timestamp("created_at").defaultNow(),
});

// Schemas for validation
export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export const insertCallOutcomeSchema = createInsertSchema(callOutcomes).omit({
  id: true,
});

export const insertAgentStatisticsSchema = createInsertSchema(agentStatistics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCallDetailsSchema = createInsertSchema(callDetails).omit({
  id: true,
  createdAt: true,
});

// Types
export type Agent = typeof agents.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type CallOutcome = typeof callOutcomes.$inferSelect;
export type AgentStatistics = typeof agentStatistics.$inferSelect;
export type CallDetails = typeof callDetails.$inferSelect;

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertCallOutcome = z.infer<typeof insertCallOutcomeSchema>;
export type InsertAgentStatistics = z.infer<typeof insertAgentStatisticsSchema>;
export type InsertCallDetails = z.infer<typeof insertCallDetailsSchema>;

// Additional types for the frontend
export const statisticsFilterSchema = z.object({
  date: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  timeFrom: z.string().optional(),
  timeTo: z.string().optional(),
  agentIds: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
  callDurationFilter: z.array(z.enum(['0-30', '30-60', '60+'])).optional(),
});

export type StatisticsFilter = z.infer<typeof statisticsFilterSchema>;

// Project targets table for storing target numbers per project
export const projectTargets = pgTable("project_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  targetValue: integer("target_value").notNull().default(0), // Soll-Wert
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectTargetsSchema = createInsertSchema(projectTargets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProjectTargets = typeof projectTargets.$inferSelect;
export type InsertProjectTargets = z.infer<typeof insertProjectTargetsSchema>;

// Outcome categories for call notifications
export type OutcomeCategory = 'positive' | 'negative' | 'offen';

// Categorize outcomes by type
export const OutcomeCategoryMap: Record<string, OutcomeCategory> = {
  // Positive outcomes
  'Termin': 'positive',
  'Termin | Infomail': 'positive',
  'selbst gebucht': 'positive',
  // Negative outcomes
  'Kein Interesse': 'negative',
  'nicht erreicht': 'negative',
  'KI Ansprechpartner': 'negative',
  'Falsche Nummer': 'negative',
  'Nicht zuständig': 'negative',
  // Open outcomes (neutral/waiting)
  'Rückruf': 'offen',
  'Email gesendet': 'offen',
  'Wiedervorlage': 'offen',
};

export function categorizeOutcome(outcome: string): OutcomeCategory {
  return OutcomeCategoryMap[outcome] || 'offen';
}

// Schema for call notifications (unified for all outcomes)
export const callNotificationSchema = z.object({
  agentName: z.string(),
  projectName: z.string(),
  outcome: z.string(),
  category: z.enum(['positive', 'negative', 'offen']),
  count: z.number(),
  delta: z.number(),
  time: z.string().optional(),
  dateRange: z.string().optional(),
});

export type CallNotification = z.infer<typeof callNotificationSchema>;
