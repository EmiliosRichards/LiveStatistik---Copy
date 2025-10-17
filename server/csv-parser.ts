import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CSVRow {
  Agent: string;
  Projekt: string;
  Datum: string;
  Anzahl: number;
  abgeschlossen: number;
  erfolgreich: number;
  'WZ/h': number;
  'GZ/h': number;
  'NBZ/h': number;
  'VBZ/h': number;
  'Erfolg/h': number;
  'AZ/h': number;
}

export function parseCSV(csvContent: string): CSVRow[] {
  // Handle both Windows (\r\n) and Unix (\n) line endings
  const lines = csvContent.trim().replace(/\r\n/g, '\n').split('\n');
  const header = lines[0].split(';').map(col => col.trim());
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';').map(val => val.trim());
    const row: any = {};

    header.forEach((col, index) => {
      const value = values[index] || '';
      
      // Convert numeric columns
      if (['Anzahl', 'abgeschlossen', 'abgeschl.', 'erfolgreich', 'erfl.', 'WZ/h', 'GZ/h', 'NBZ/h', 'VBZ/h', 'Erfolg/h', 'AZ/h'].includes(col)) {
        row[col] = parseInt(value) || 0;
      } else {
        row[col] = value;
      }
    });

    rows.push(row as CSVRow);
  }

  return rows;
}

export function loadCSVData(): CSVRow[] {
  try {
    const csvPath = path.join(__dirname, 'data.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    return parseCSV(csvContent);
  } catch (error) {
    console.error('Error loading CSV data:', error);
    return [];
  }
}

export function getUniqueAgents(data: CSVRow[]): string[] {
  const agents = new Set(data.map(row => row.Agent));
  return Array.from(agents).sort();
}

export function getUniqueProjects(data: CSVRow[]): string[] {
  const projects = new Set(data.map(row => row.Projekt));
  return Array.from(projects).sort();
}