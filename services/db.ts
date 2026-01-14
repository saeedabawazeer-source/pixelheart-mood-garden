import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Memory } from '../types';

interface MoodGardenDB extends DBSchema {
  memories: {
    key: string;
    value: Memory;
    indexes: { 'by-date': string };
  };
}

const DB_NAME = 'pixelheart-mood-garden-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MoodGardenDB>> | null = null;

const getDB = async () => {
  if (!dbPromise) {
    dbPromise = openDB<MoodGardenDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('memories', { keyPath: 'id' });
        store.createIndex('by-date', 'date');
      },
    });
  }
  return dbPromise;
};

export const saveMemory = async (memory: Memory) => {
  const db = await getDB();
  await db.put('memories', memory);
};

export const getMemories = async (): Promise<Memory[]> => {
  const db = await getDB();
  // Get all and reverse to show newest first (simple approach)
  // Ideally use a cursor for large datasets, but this is fine for now < 10k items
  const memories = await db.getAll('memories');
  return memories.sort((a, b) => Number(b.id) - Number(a.id)); 
};

export const deleteMemory = async (id: string) => {
  const db = await getDB();
  await db.delete('memories', id);
};

export const exportMemoriesToCSV = async () => {
  const memories = await getMemories();
  if (memories.length === 0) return null;

  const headers = ['Date', 'Mood', 'Summary', 'Image URL'];
  const csvContent = [
    headers.join(','),
    ...memories.map(m => {
      // Escape quotes and handle newlines in summary/mood
      const date = `"${m.date || ''}"`;
      const mood = `"${(m.mood || '').replace(/"/g, '""')}"`;
      const summary = `"${(m.summary || '').replace(/"/g, '""')}"`;
         // Image URL might be base64, leaving it as is might be huge but it's requested "simple excel".
         // Truncate or link if it's too big? For now, keep it. 
         // User asked for "saved" pics.
      const image = `"${(m.imageUrl || '').substring(0, 100)}..."`; // Just a preview in CSV, full base64 breaks Excel often
      return [date, mood, summary, image].join(',');
    })
  ].join('\n');

  return csvContent;
};
