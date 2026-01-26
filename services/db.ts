import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Memory } from '../types';
import { saveMemoryToCloud, getMemoriesFromCloud } from './supabase';

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
  // Save locally first
  const db = await getDB();
  await db.put('memories', memory);

  // Then sync to cloud (non-blocking)
  saveMemoryToCloud(memory).catch(err => console.warn('Cloud sync failed:', err));
};

export const getMemories = async (): Promise<Memory[]> => {
  // Try cloud first for cross-device sync
  try {
    const cloudMemories = await getMemoriesFromCloud();
    if (cloudMemories.length > 0) {
      // Map cloud format to local format
      return cloudMemories.map(m => ({
        id: m.id,
        date: m.date,
        mood: m.mood,
        imageUrl: m.image_url,
        summary: m.summary
      }));
    }
  } catch (err) {
    console.warn('Cloud fetch failed, using local:', err);
  }

  // Fallback to local IndexedDB
  const db = await getDB();
  const memories = await db.getAll('memories');
  return memories.sort((a, b) => Number(b.id) - Number(a.id));
};

export const deleteMemory = async (id: string) => {
  const db = await getDB();
  await db.delete('memories', id);
};

// Sync all local memories to cloud (for migrating existing photos)
export const syncLocalToCloud = async (): Promise<{ synced: number; failed: number }> => {
  const db = await getDB();
  const localMemories = await db.getAll('memories');

  let synced = 0;
  let failed = 0;

  for (const memory of localMemories) {
    try {
      const success = await saveMemoryToCloud(memory);
      if (success) {
        synced++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error('Failed to sync memory:', memory.id, err);
      failed++;
    }
  }

  console.log(`✅ Synced ${synced} memories to cloud, ${failed} failed`);
  return { synced, failed };
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
