import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Make database optional so the server can run without a DATABASE_URL.
// Database-backed storage (DatabaseStorage) should only be used when this is set.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("DATABASE_URL not set. Database-backed storage is disabled.");
}

export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null as any;
export const db = databaseUrl ? drizzle({ client: pool as any, schema }) : null as any;
