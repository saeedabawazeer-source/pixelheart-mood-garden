import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini Client
// @ts-ignore - process.env.API_KEY is injected by the bundler/environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface MoodAnalysis {
  mouth: string;
  eyes: string;
  eyebrows: string;
  bgColor: string;
  summary: string;
}

// Valid DiceBear Lorelei parts to prevent 400 Errors
const VALID_MOUTHS = "happy01, happy02, happy03, happy04, happy05, happy06, happy07, happy08, happy09, happy10, happy11, happy12, happy13, happy14, sad01, sad02, sad03, sad04, sad05, sad06, sad07, sad08, sad09, sad10, sad11, sad12, smile01, smile02, smile03, smile04, smile05, smirk01, surprised01, surprised02, surprised03, surprised04";
const VALID_EYES = "happy01, happy02, happy03, happy04, happy05, happy06, happy07, happy08, happy09, happy10, happy11, happy12, sad01, sad02, sad03, sad04, sad05, wink, sleepy, neutral, surprised01";
const VALID_EYEBROWS = "angry01, angry02, happy01, happy02, happy03, happy04, happy05, happy06, happy07, happy08, happy09, happy10, happy11, happy12, neutral01, sad01, sad02, sad03, sad04";

export const analyzeMood = async (text: string): Promise<MoodAnalysis> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `User mood: "${text}". 
      Based on this mood, select the most appropriate visual parameters for a 'Lorelei' style avatar.
      
      Constraints:
      1. 'mouth' must be one of: ${VALID_MOUTHS}
      2. 'eyes' must be one of: ${VALID_EYES}
      3. 'eyebrows' must be one of: ${VALID_EYEBROWS}
      4. 'bgColor' must be a vivid, cute hex color (e.g., FFD700, FF69B4, 87CEEB) WITHOUT the hash #.
      5. 'summary' should be a short, punchy 1-3 word sticky note phrase describing the vibe (e.g., "Main Character", "Sleepy Girl", "Slaying").`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mouth: { type: Type.STRING },
            eyes: { type: Type.STRING },
            eyebrows: { type: Type.STRING },
            bgColor: { type: Type.STRING },
            summary: { type: Type.STRING }
          },
          required: ["mouth", "eyes", "eyebrows", "bgColor", "summary"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as MoodAnalysis;
    }
    throw new Error("No response text");
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    // Fallback if AI fails
    return {
      mouth: 'smile01',
      eyes: 'neutral',
      eyebrows: 'neutral01',
      bgColor: 'FFD700',
      summary: 'Just Vibes'
    };
  }
};
