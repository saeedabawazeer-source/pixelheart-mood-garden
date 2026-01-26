import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ftbwnnlymfdpixfsimju.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
    console.warn('⚠️ Supabase anon key not set. Cloud sync will not work.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
export interface CloudMemory {
    id: string;
    date: string;
    mood: string;
    image_url: string;
    summary: string;
    created_at?: string;
}

// Save memory to Supabase
export const saveMemoryToCloud = async (memory: {
    id: string;
    date: string;
    mood: string;
    imageUrl: string;
    summary: string;
}): Promise<boolean> => {
    try {
        if (!supabaseAnonKey) {
            console.warn('Supabase not configured, skipping cloud save');
            return false;
        }

        const { error } = await supabase
            .from('memories')
            .upsert({
                id: memory.id,
                date: memory.date,
                mood: memory.mood,
                image_url: memory.imageUrl,
                summary: memory.summary,
            });

        if (error) {
            console.error('Error saving to cloud:', error);
            return false;
        }

        console.log('✅ Saved to cloud:', memory.id);
        return true;
    } catch (err) {
        console.error('Cloud save failed:', err);
        return false;
    }
};

// Get all memories from Supabase
export const getMemoriesFromCloud = async (): Promise<CloudMemory[]> => {
    try {
        if (!supabaseAnonKey) {
            console.warn('Supabase not configured, returning empty');
            return [];
        }

        const { data, error } = await supabase
            .from('memories')
            .select('*')
            .order('id', { ascending: false });

        if (error) {
            console.error('Error fetching from cloud:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('Cloud fetch failed:', err);
        return [];
    }
};
