
export type Mood = 'happy' | 'sad' | 'tired' | 'excited' | 'anxious' | 'loved';

export interface MoodEntry {
  mood: Mood;
  note: string;
  timestamp: number;
}

export interface GeminiResponse {
  message: string;
  advice: string;
  pixelArtIdea: string;
  flowerType: string;
  imageUrl?: string;
}

export interface Memory {
  id: string;
  date: string;
  mood: string;
  imageUrl: string;
  summary: string;
}
