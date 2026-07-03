import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleGenAI } from "@google/genai";

const DB_KEY = 'ogoo_users_db';
const OGOO_SYSTEM_INSTRUCTION = "You are Ogoo, a personalized health assistant.";

interface UserRecord {
  deviceId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  authType?: string;
  returningStatus?: string;
  location?: any;
  onboarded: boolean;
  history?: any[];
  waterIntake?: number;
  waterLog?: any[];
  schedule?: any[];
  vitalsLog?: any[];
  activity?: { steps: number; stepGoal: number; minutes: number; calories: number };
  customPlan?: string;
  safetyMetrics?: any;
}

async function loadDb(): Promise<Record<string, UserRecord>> {
  try {
    const data = await AsyncStorage.getItem(DB_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load users DB:", e);
  }
  return {};
}

async function saveDb(db: Record<string, UserRecord>) {
  try {
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("Failed to save users DB:", e);
  }
}

let ai: GoogleGenAI | null = null;
const getAi = () => {
  if (!ai) {
    if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    ai = new GoogleGenAI({ 
      apiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
  }
  return ai;
};

export async function userInit(reqBody: any): Promise<any> {
    const data = await _userInit(reqBody);
    return { ok: !data.error, json: async () => data };
}
async function _userInit(reqBody: any): Promise<any> {
    const db = await loadDb();
    const { deviceId, location } = reqBody;
    
    if (!deviceId) return { error: "deviceId required", status: 400 };

    let userRecord = db[deviceId];
    if (!userRecord) {
      userRecord = {
        deviceId,
        location,
        onboarded: false,
        history: []
      };
      db[deviceId] = userRecord;
      await saveDb(db);
    }
    return { profile: userRecord };
}

export async function userClear(reqBody: any): Promise<any> {
    const data = await _userClear(reqBody);
    return { ok: !data.error, json: async () => data };
}
async function _userClear(reqBody: any): Promise<any> {
    const db = await loadDb();
    const { deviceId } = reqBody;
    if (db[deviceId]) {
        delete db[deviceId];
        await saveDb(db);
    }
    return { success: true };
}

export async function userUpdateMetrics(reqBody: any): Promise<any> {
    const data = await _userUpdateMetrics(reqBody);
    return { ok: !data.error, json: async () => data };
}
async function _userUpdateMetrics(reqBody: any): Promise<any> {
    const db = await loadDb();
    const { deviceId, ...updates } = reqBody;
    if (!deviceId || !db[deviceId]) return { error: "User not found", status: 404 };
    
    Object.assign(db[deviceId], updates);
    await saveDb(db);
    return { success: true, profile: db[deviceId] };
}

export async function backendChat(reqBody: any): Promise<any> {
    const data = await _chat(reqBody);
    return { ok: !data.error, json: async () => data };
}
async function _chat(reqBody: any): Promise<any> {
    const db = await loadDb();
    const { deviceId, location, message, mode, vitals, activity, waterIntake, waterGoal, schedule } = reqBody;
    if (!deviceId) return { error: "deviceId is required", status: 400 };

    let userRecord = db[deviceId];
    if (!userRecord) {
      userRecord = { deviceId, location, onboarded: false, history: [] };
      db[deviceId] = userRecord;
    }

    try {
      const currentAi = getAi();
      const model = "gemini-3.5-flash";
      const response = await currentAi.models.generateContent({
        model,
        contents: message,
        config: { systemInstruction: OGOO_SYSTEM_INSTRUCTION }
      });
      const cleanReply = response.text || "";
      
      userRecord.history = userRecord.history || [];
      userRecord.history.push({ id: Date.now().toString(), text: message, fromUser: true, timestamp: new Date().toISOString() });
      userRecord.history.push({ id: (Date.now() + 1).toString(), text: cleanReply, fromUser: false, timestamp: new Date().toISOString() });
      await saveDb(db);

      return { reply: cleanReply, profile: userRecord };
    } catch (e: any) {
      return { error: e.message, status: 500 };
    }
}

export async function generatePlan(reqBody: any): Promise<any> {
    const data = await _generatePlan(reqBody);
    return { ok: !data.error, json: async () => data };
}
async function _generatePlan(reqBody: any): Promise<any> {
    const { steps, stepGoal, waterIntake, waterGoal, bpm, bp, spo2, temp } = reqBody;
    const prompt = `Generate a plan based on: Steps ${steps}/${stepGoal}, Vitals: HR ${bpm}, BP ${bp}, SpO2 ${spo2}%, Temp ${temp}F`;
    try {
        const currentAi = getAi();
        const response = await currentAi.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: { systemInstruction: OGOO_SYSTEM_INSTRUCTION }
        });
        return { plan: response.text };
    } catch (e: any) {
        return { error: e.message, status: 500 };
    }
}

export async function analyzeMedia(reqBody: any): Promise<any> {
    const data = await _analyzeMedia(reqBody);
    return { ok: !data.error, json: async () => data };
}
async function _analyzeMedia(reqBody: any): Promise<any> {
    const { base64, mimeType, prompt } = reqBody;
    try {
        const currentAi = getAi();
        const response = await currentAi.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
                { inlineData: { data: base64, mimeType: mimeType || "application/octet-stream" } },
                prompt || "Analyze this media"
            ],
            config: { systemInstruction: OGOO_SYSTEM_INSTRUCTION }
        });
        return { reply: response.text };
    } catch (e: any) {
        return { error: e.message, status: 500 };
    }
}
