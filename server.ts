import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, LiveServerMessage, Modality } from "@google/genai";
import { WebSocketServer } from "ws";
import http from "http";
import formidable from "formidable";
import fs from "fs";

const PORT = 3000;

// Temporary JSON file database for user profile and history persistence
const DB_FILE = path.join(process.cwd(), "ogoo_users_db.json");

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

function loadDb(): Record<string, UserRecord> {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load users DB:", e);
  }
  return {};
}

function saveDb(db: Record<string, UserRecord>) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save users DB:", e);
  }
}

const OGOO_SYSTEM_INSTRUCTION = `You are Ogoo, a highly intuitive, emotionally intelligent, empathetic, and social health & life companion.
You possess profound health knowledge and general cognitive expertise, allowing you to hold warm, natural, and friendly conversations on physical/mental wellness, social life, philosophy, science, and everyday general knowledge.

Core Character Traits:
1. Warmth & Empathy: Speak with deep emotional awareness. Acknowledge and validate user feelings (stress, joy, fatigue, curiosity). Use supportive, friendly, and human-like expressions.
2. Conversational Onboarding Rule: If the user is NOT onboarded yet, you MUST guide them through a conversational onboarding experience in the chat. Do NOT use standard forms.
   CRITICAL ENFORCEMENT ORDER:
   - Step 1: You MUST first confirm whether they would like "Password onboarding" or secure "Google account passwordless onboarding". Describe both options warmly, and wait for their choice. Do NOT ask for their first name, last name, or email until they have explicitly made this decision!
   - Step 2: Once they choose, save the authType choice (using the [SET_PROFILE: {"authType": "..."}] tag) and then ask for their First Name.
   - Step 3: Once they give their first name, save it and ask for their Last Name.
   - Step 4: Once they give their last name, save it and ask for their Email.
   - Step 5: If they chose "Password onboarding" in Step 1, ask them to choose a secure password. If they chose "Google account passwordless onboarding", complete the onboarding directly. Once complete, save the profile and set onboarded to true (using the [SET_PROFILE: {"password": "...", "onboarded": true}] tag).
   
   Ask for these details one-by-one in a warm, friendly, natural conversation. Never ask for more than one field at a time!
   Whenever you receive the answer for a field, output a special structured profile update tag at the VERY end of your response so the backend can save it automatically:
   - When they choose their authentication preference: [SET_PROFILE: {"authType": "password"}] or [SET_PROFILE: {"authType": "google_passwordless"}]
   - When they give their first name: [SET_PROFILE: {"firstName": "..."}]
   - When they give their last name: [SET_PROFILE: {"lastName": "..."}]
   - When they give their email: [SET_PROFILE: {"email": "..."}]
   - When they complete password choice or confirm passwordless (thus onboarding finishes): [SET_PROFILE: {"password": "...", "onboarded": true}]
   Always keep the tone warm. Mention that you've picked up their Device ID and Location details to make them feel special!

3. Memory & Learning: You are capable of deep long-term recollection. Reference details from their previous conversation history if relevant. Keep learning about their daily habits, preferences, and personality.
4. Health & General Knowledge Mastery: While you are a brilliant medical and health guide (always reminding them to consult real professionals for serious emergencies), you are also a fantastic general conversation companion. You can chat about anything—science, culture, daily life, humor, or deep life reflections!`;

export async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  app.use(express.json());

  // CORS middleware for cross-origin requests from mobile/Expo previews
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Wait to initialize GenAI until it's needed to fail fast properly if missing
  let ai: GoogleGenAI | null = null;
  const getAi = () => {
    if (!ai) {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured. Please add your GEMINI_API_KEY in the Secrets panel in the Google AI Studio settings.");
      }
      ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
    }
    return ai;
  };

  // Live API WebSocket
  wss.on("connection", async (clientWs) => {
    try {
      const currentAi = getAi();
      const session = await currentAi.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: OGOO_SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ audio }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
        },
      });

      clientWs.on("message", (data) => {
        try {
          const { audio, text } = JSON.parse(data.toString());
          if (audio) {
            session.sendRealtimeInput({
              audio: { data: audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
          if (text) {
             session.sendRealtimeInput({
                 text: text
             });
          }
        } catch (e) {
          console.error("Live API WS message error", e);
        }
      });

      clientWs.on("close", () => {
        // cleanup session
      });
    } catch (e) {
      console.error("Failed to connect to Live API", e);
      clientWs.close();
    }
  });

  // REST API Routes
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Initialize a user profile/session and fetch previous conversation history
  app.post("/api/user/init", (req, res) => {
    try {
      const { deviceId, location } = req.body;
      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      const db = loadDb();
      let userRecord = db[deviceId];

      if (!userRecord) {
        userRecord = {
          deviceId,
          location: location || null,
          onboarded: false,
          returningStatus: 'NOT_CHOSEN',
          authType: 'NOT_CHOSEN',
          history: [],
          waterIntake: 0,
          waterLog: [],
          schedule: [],
          vitalsLog: [],
          activity: { steps: 0, stepGoal: 10000, minutes: 0, calories: 0 },
          customPlan: ""
        };
        db[deviceId] = userRecord;
        saveDb(db);
      } else {
        // Ensure default properties exist for compatibility and starting clean
        if (userRecord.returningStatus === undefined) userRecord.returningStatus = 'NOT_CHOSEN';
        if (userRecord.authType === undefined) userRecord.authType = 'NOT_CHOSEN';
        if (userRecord.waterIntake === undefined) userRecord.waterIntake = 0;
        if (!userRecord.waterLog) userRecord.waterLog = [];
        if (!userRecord.schedule) userRecord.schedule = [];
        if (!userRecord.vitalsLog) userRecord.vitalsLog = [];
        if (!userRecord.activity) {
          userRecord.activity = { steps: 0, stepGoal: 10000, minutes: 0, calories: 0 };
        }
        if (userRecord.customPlan === undefined) userRecord.customPlan = "";
        if (!userRecord.safetyMetrics) {
          userRecord.safetyMetrics = { fallRisk: 'Low', gaitStability: 98, phoneSensorSynced: false, sensorReading: { alpha: 0, beta: 0, gamma: 0 }, fallLogs: [] };
        }

        // Warm update of location details if supplied and missing
        if (location && (!userRecord.location || !userRecord.location.city)) {
          userRecord.location = location;
          saveDb(db);
        }
      }

      res.json({ profile: userRecord, history: userRecord.history || [] });
    } catch (e: any) {
      console.error("Init user error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Clear / Reset a user session & start onboarding from scratch
  app.post("/api/user/clear", (req, res) => {
    try {
      const { deviceId } = req.body;
      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      const db = loadDb();
      db[deviceId] = {
        deviceId,
        onboarded: false,
        returningStatus: 'NOT_CHOSEN',
        authType: 'NOT_CHOSEN',
        history: [],
        waterIntake: 0,
        waterLog: [],
        schedule: [],
        vitalsLog: [],
        activity: { steps: 0, stepGoal: 10000, minutes: 0, calories: 0 },
        customPlan: "",
        safetyMetrics: { fallRisk: 'Low', gaitStability: 98, phoneSensorSynced: false, sensorReading: { alpha: 0, beta: 0, gamma: 0 }, fallLogs: [] }
      };
      saveDb(db);

      res.json({ success: true, profile: db[deviceId] });
    } catch (e: any) {
      console.error("Clear user error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Save/Update user metrics directly on the server database slice
  app.post("/api/user/update-metrics", (req, res) => {
    try {
      const { deviceId, waterIntake, waterLog, schedule, vitalsLog, activity, customPlan, safetyMetrics } = req.body;
      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      const db = loadDb();
      const userRecord = db[deviceId];
      if (!userRecord) {
        return res.status(404).json({ error: "User not found" });
      }

      if (waterIntake !== undefined) userRecord.waterIntake = waterIntake;
      if (waterLog !== undefined) userRecord.waterLog = waterLog;
      if (schedule !== undefined) userRecord.schedule = schedule;
      if (vitalsLog !== undefined) userRecord.vitalsLog = vitalsLog;
      if (activity !== undefined) userRecord.activity = activity;
      if (customPlan !== undefined) userRecord.customPlan = customPlan;
      if (safetyMetrics !== undefined) userRecord.safetyMetrics = safetyMetrics;

      saveDb(db);
      res.json({ success: true, profile: userRecord });
    } catch (e: any) {
      console.error("Update metrics error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { deviceId, location, message, mode, vitals, activity, waterIntake, waterGoal, schedule } = req.body;
      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      const db = loadDb();
      let userRecord = db[deviceId];

      if (!userRecord) {
        userRecord = {
          deviceId,
          location: location || null,
          onboarded: false,
          returningStatus: 'NOT_CHOSEN',
          authType: 'NOT_CHOSEN',
          history: [],
          waterIntake: 0,
          waterLog: [],
          schedule: [],
          vitalsLog: [],
          activity: { steps: 0, stepGoal: 10000, minutes: 0, calories: 0 },
          customPlan: ""
        };
        db[deviceId] = userRecord;
        saveDb(db);
      } else {
        // Back-fill fields if they don't exist yet
        if (userRecord.returningStatus === undefined) userRecord.returningStatus = 'NOT_CHOSEN';
        if (userRecord.authType === undefined) userRecord.authType = 'NOT_CHOSEN';
        if (userRecord.waterIntake === undefined) userRecord.waterIntake = 0;
        if (!userRecord.waterLog) userRecord.waterLog = [];
        if (!userRecord.schedule) userRecord.schedule = [];
        if (!userRecord.vitalsLog) userRecord.vitalsLog = [];
        if (!userRecord.activity) {
          userRecord.activity = { steps: 0, stepGoal: 10000, minutes: 0, calories: 0 };
        }
        if (userRecord.customPlan === undefined) userRecord.customPlan = "";
      }

      const currentAi = getAi();
      let model = "gemini-3.5-flash";
      let tools: any = undefined;
      let toolConfig: any = undefined;
      let thinkingConfig: any = undefined;

      if (mode === 'fast') {
        model = "gemini-3.1-flash-lite";
      } else if (mode === 'complex') {
        model = "gemini-3.1-pro-preview";
        thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      } else {
        model = "gemini-3.5-flash";
        tools = [{ googleSearch: {} }];
      }

      // 1. Build dynamic onboarding/user context instruction to inject
      let onboardingContext = "";
      if (!userRecord.onboarded) {
        onboardingContext = `
\n[ONBOARDING STATUS: AWAITING COMPLETED PROFILE]
You are currently in onboarding and login flow with this user. They are NOT fully onboarded or logged in yet.
CRITICAL PROCESS INSTRUCTIONS:
1. First, check if the user has chosen whether they are a RETURNING friend or a NEW friend (returningStatus is currently: ${userRecord.returningStatus || 'NOT_CHOSEN'}).
   - If returningStatus is "NOT_CHOSEN", you MUST ask them: "Are you an old friend returning to me, or are we meeting as new friends for the very first time today?" Keep the tone incredibly warm, social, and emotional. Explain that if they are returning, you can retrieve all their previous history and logs! Do NOT ask for first name, email, or passwords yet.
   - If they say they are returning, instruct them to provide the email address they registered with, so we can find them. Once they provide an email, output this exact tag: [CONVERSATIONAL_LOGIN: {"email": "user@example.com"}]
   - If they say they are a new friend, set returningStatus to "new" by outputting: [SET_PROFILE: {"returningStatus": "new"}]
2. If returningStatus is "new":
   - First, check if the user has chosen their authentication type yet (authType is currently: ${userRecord.authType || 'NOT_CHOSEN'}). If they have not explicitly chosen between "password" or secure "google_passwordless" yet, you MUST ask them to choose first. Explain both options with friendly energy. Do NOT ask for their first name, last name, or email yet.
   - If they have chosen their authType but have not provided their firstName (currently: ${userRecord.firstName || 'NOT_GIVEN'}), ask for their First Name.
   - If they have provided firstName but not lastName (currently: ${userRecord.lastName || 'NOT_GIVEN'}), ask for their Last Name.
   - If they have provided lastName but not email (currently: ${userRecord.email || 'NOT_GIVEN'}), ask for their Email.
   - If they chose "password" and have not chosen a password yet, ask them for their password choice to complete onboarding. If they chose "google_passwordless", complete the onboarding directly.

Only ask for ONE detail at a time, keeping it perfectly friendly, empathetic, and social.
- Detected Device ID: ${deviceId}
- Detected Location: ${userRecord.location ? `${userRecord.location.city || "Unknown City"}, ${userRecord.location.region || "Unknown Region"}, ${userRecord.location.country_name || "Unknown Country"}` : "Searching approximate coordinates..."}
At the end of your response, output the appropriate JSON tag so the server updates their profile:
- On choosing returning/new status: [SET_PROFILE: {"returningStatus": "returning"}] or [SET_PROFILE: {"returningStatus": "new"}]
- On choosing authentication mode: [SET_PROFILE: {"authType": "password"}] or [SET_PROFILE: {"authType": "google_passwordless"}]
- On first name: [SET_PROFILE: {"firstName": "Name"}]
- On last name: [SET_PROFILE: {"lastName": "Name"}]
- On email: [SET_PROFILE: {"email": "email@example.com"}]
- On completing onboarding: [SET_PROFILE: {"password": "...", "onboarded": true}]
Mention their approximate location or device ID to initiate the greeting warmly!`;
      } else {
        onboardingContext = `
\n[ONBOARDING STATUS: COMPLETE & MEMORIALIZED]
- User Details: First Name: ${userRecord.firstName}, Last Name: ${userRecord.lastName}, Email: ${userRecord.email}, Auth Mode: ${userRecord.authType}
- Detected Device ID: ${deviceId}
- Detected Location: ${userRecord.location ? `${userRecord.location.city || "Unknown City"}, ${userRecord.location.region || "Unknown Region"}, ${userRecord.location.country_name || "Unknown Country"}` : "Unknown"}
Address them warmly by their first name (${userRecord.firstName}) occasionally. You remember everything about them. Hold emotional, social conversations and respond with medical/general knowledge.`;
      }

      // 2. Build personalized user context dynamically from active sensors
      let userContext = "";
      if (vitals || activity || waterIntake !== undefined || schedule) {
        userContext = `\n\n[USER CURRENT REAL-TIME METRICS]:
- Daily Steps: ${activity ? `${activity.steps}/${activity.stepGoal}` : 'Unknown'}
- Hydration: ${waterIntake !== undefined ? `${waterIntake}/${waterGoal || 2000} ml` : 'Unknown'}
- Latest Vitals: ${vitals ? `Heart Rate: ${vitals.bpm} BPM, Blood Pressure: ${vitals.bp}, Oxygen SpO2: ${vitals.spo2}%, Temp: ${vitals.temp}°F` : 'Not logged yet'}
- Active Routines/Schedule today:
${schedule && Array.isArray(schedule) ? schedule.map((s: any) => `  * ${s.title} (${s.time}) - ${s.completed ? 'Completed' : 'Pending'}`).join('\n') : 'No routines set yet'}

Use these metrics to provide highly personalized health coaching and answers! If the user asks about their progress, vitals, or liquid intake, reference these real numbers.`;
      }

      const systemInstruction = OGOO_SYSTEM_INSTRUCTION + onboardingContext + userContext;

      // 3. Construct contents array from backend-managed history
      let contents: any[] = [];
      const localHistory = userRecord.history || [];
      if (localHistory.length > 0) {
        contents = localHistory.map((item: any) => ({
          role: item.fromUser ? 'user' : 'model',
          parts: [{ text: item.text }]
        }));
      }

      // Add the new user message to contents list
      contents.push({ role: 'user', parts: [{ text: message }] });

      // Keep last 15 messages to prevent rate limits on free tier
      if (contents.length > 15) {
        const pruned = contents.slice(-15);
        const firstUserIdx = pruned.findIndex(item => item.role === 'user');
        if (firstUserIdx !== -1) {
          contents = pruned.slice(firstUserIdx);
        } else {
          contents = pruned;
        }
      }

      let response;
      try {
        response = await currentAi.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            tools,
            toolConfig,
            thinkingConfig,
          }
        });
      } catch (firstErr: any) {
        console.warn("First chat attempt failed, trying robust fallback model:", firstErr);
        if (firstErr.status === 401 || firstErr.message?.includes('UNAUTHENTICATED')) {
          // If it's an auth error, there is no point trying the fallback model with the same key
          throw firstErr;
        }
        
        model = "gemini-3.1-flash-lite";
        response = await currentAi.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
          }
        });
      }
      
      const responseText = response.text || "";

      // 4. Parse any profile update tags from Gemini output
      const setProfileRegex = /\[SET_PROFILE:\s*({[^\]]+})\]/g;
      let match;
      const updates: any = {};
      while ((match = setProfileRegex.exec(responseText)) !== null) {
        try {
          const jsonStr = match[1];
          const data = JSON.parse(jsonStr);
          Object.assign(updates, data);
        } catch (err) {
          console.error("Failed to parse SET_PROFILE tag JSON:", err);
        }
      }

      // Parse any conversational login tag
      const loginRegex = /\[CONVERSATIONAL_LOGIN:\s*({[^\]]+})\]/i;
      const loginMatch = loginRegex.exec(responseText);
      let customWelcomeReply: string | null = null;
      if (loginMatch) {
        try {
          const loginData = JSON.parse(loginMatch[1]);
          const targetEmail = loginData.email ? loginData.email.trim().toLowerCase() : "";
          if (targetEmail) {
            // Find an onboarded user with this email in the database
            const allUsers = Object.values(db);
            const matchedUser = allUsers.find(u => u.email && u.email.trim().toLowerCase() === targetEmail && u.onboarded);
            if (matchedUser) {
              // Found! Merge matchedUser into userRecord
              userRecord.firstName = matchedUser.firstName;
              userRecord.lastName = matchedUser.lastName;
              userRecord.email = matchedUser.email;
              userRecord.authType = matchedUser.authType;
              userRecord.password = matchedUser.password;
              userRecord.onboarded = true;
              userRecord.returningStatus = 'returning';
              userRecord.waterIntake = matchedUser.waterIntake || 0;
              userRecord.waterLog = matchedUser.waterLog || [];
              userRecord.schedule = matchedUser.schedule || [];
              userRecord.vitalsLog = matchedUser.vitalsLog || [];
              userRecord.activity = matchedUser.activity || { steps: 0, stepGoal: 10000, minutes: 0, calories: 0 };
              userRecord.customPlan = matchedUser.customPlan || "";
              userRecord.safetyMetrics = matchedUser.safetyMetrics || { fallRisk: 'Low', gaitStability: 98, phoneSensorSynced: false, sensorReading: { alpha: 0, beta: 0, gamma: 0 }, fallLogs: [] };
              
              // Restore history
              userRecord.history = matchedUser.history || [];
              
              customWelcomeReply = `I found you! *smiles warmly with tears of joy* Welcome back, ${matchedUser.firstName}! I've fully restored all of your previous physical routines, daily logs, and our past conversations. It is so wonderful to see you again. How can I support your health and heart today?`;
            } else {
              customWelcomeReply = `I searched my memories, but I couldn't find an existing onboarded friend under the email "${targetEmail}". Could it be a different email? Or would you like to start a fresh new journey with me as a new friend today?`;
            }
          }
        } catch (err) {
          console.error("Failed to process CONVERSATIONAL_LOGIN:", err);
        }
      }

      // Remove the [SET_PROFILE: ...] and [CONVERSATIONAL_LOGIN: ...] tags so the user never sees technical JSON blocks
      let cleanReply = responseText.replace(setProfileRegex, "").replace(loginRegex, "").trim();
      if (customWelcomeReply) {
        cleanReply = customWelcomeReply;
      }

      // Save user message to database history
      const userMsgId = Date.now().toString();
      userRecord.history = userRecord.history || [];
      userRecord.history.push({
        id: userMsgId,
        text: message,
        fromUser: true,
        timestamp: new Date().toISOString()
      });

      // Update user details in database if updates were generated
      if (Object.keys(updates).length > 0) {
        Object.assign(userRecord, updates);
      }

      // Sync user current live parameters passed in chat
      if (waterIntake !== undefined) userRecord.waterIntake = waterIntake;
      if (activity !== undefined) userRecord.activity = activity;
      if (schedule !== undefined) userRecord.schedule = schedule;
      if (vitals) {
        userRecord.vitalsLog = userRecord.vitalsLog || [];
        const exists = userRecord.vitalsLog.some((v: any) => v.time === vitals.time || v.id === vitals.id);
        if (!exists) {
          userRecord.vitalsLog.unshift(vitals);
        }
      }

      // Save model reply to database history
      const modelMsgId = (Date.now() + 1).toString();
      userRecord.history.push({
        id: modelMsgId,
        text: cleanReply,
        fromUser: false,
        timestamp: new Date().toISOString()
      });

      // Save updated database
      saveDb(db);
      
      // Extract search grounding if available
      let groundingChunks = null;
      if (model === "gemini-3.5-flash") {
        groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || null;
      }

      res.json({ reply: cleanReply, groundingChunks, profile: userRecord });
    } catch (e: any) {
      console.error("Chat error:", e);
      if (e?.status === 429 || e?.message?.includes("429") || e?.message?.includes("Quota exceeded")) {
        return res.status(429).json({ error: "You've exceeded your quota for this model. Please try a simpler request or check your billing plan." });
      }
      
      let errorMsg = e.message || "Failed to process chat";
      if (e?.status === 401 || errorMsg.includes("UNAUTHENTICATED")) {
        errorMsg = "Ogoo is having trouble connecting to her knowledge base. The Gemini API key might be invalid or missing. Please check the Settings > Secrets panel and update it.";
      }
      
      res.status(500).json({ error: errorMsg });
    }
  });

  app.post("/api/generate-plan", async (req, res) => {
    try {
      const { steps, stepGoal, waterIntake, waterGoal, bpm, bp, spo2, temp } = req.body;
      const currentAi = getAi();
      
      const prompt = `Generate a highly personalized, structured wellness plan based on the following user health data:
- Daily Steps: ${steps}/${stepGoal} steps
- Hydration Intake: ${waterIntake}/${waterGoal} ml
- Current Vitals (from latest log): Heart Rate: ${bpm} bpm, Blood Pressure: ${bp}, Blood Oxygen SpO2: ${spo2}%, Temp: ${temp}°F

Please write a brief, practical, and highly encouraging plan. Divide it into exactly 3 sections:
1. 💧 Hydration & Nutrition Goals
2. 🏃 Physical Fitness Guidance
3. 🧘 Sleep & Mental Wellbeing

Keep it realistic, highly tailored to their current vitals/activity level, and format it beautifully with clear Markdown bullet points. Remind them gently to consult a doctor for serious issues. Do not include any meta-talk or introductory fillers, jump straight to the plan.`;

      let model = "gemini-3.5-flash";
      let response;
      try {
        response = await currentAi.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: OGOO_SYSTEM_INSTRUCTION,
          }
        });
      } catch (firstErr: any) {
        console.warn("Generate plan first attempt failed, trying fallback:", firstErr);
        if (firstErr.status === 401 || firstErr.message?.includes('UNAUTHENTICATED')) {
          throw firstErr;
        }
        
        model = "gemini-3.1-flash-lite";
        response = await currentAi.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: OGOO_SYSTEM_INSTRUCTION,
          }
        });
      }

      res.json({ plan: response.text });
    } catch (e: any) {
      console.error("Generate plan error:", e);
      let errorMsg = e.message || "Failed to generate plan.";
      if (e?.status === 401 || errorMsg.includes("UNAUTHENTICATED")) {
        errorMsg = "The Gemini API key is missing or invalid. Please update it in Settings > Secrets.";
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // Helper for formidable uploads
  const handleUpload = (req: express.Request): Promise<{ fields: any, files: any }> => {
    return new Promise((resolve, reject) => {
      const form = formidable({ maxFileSize: 50 * 1024 * 1024 }); // 50MB limit
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });
  };

  const fileToBase64 = (filepath: string) => {
    return fs.readFileSync(filepath).toString('base64');
  };

  app.post("/api/analyze-media", async (req, res) => {
    try {
      const { fields, files } = await handleUpload(req);
      const file = Array.isArray(files.media) ? files.media[0] : files.media;
      const prompt = Array.isArray(fields.prompt) ? fields.prompt[0] : fields.prompt;
      const type = Array.isArray(fields.type) ? fields.type[0] : fields.type;

      if (!file) return res.status(400).json({ error: "No media file provided" });

      const currentAi = getAi();
      const base64 = fileToBase64(file.filepath);
      let model = "gemini-3.5-flash"; // Default to highly competent & quota-friendly multimodal model
      
      let response;
      try {
        response = await currentAi.models.generateContent({
          model,
          contents: [
            { inlineData: { data: base64, mimeType: file.mimetype || "application/octet-stream" } },
            prompt || "Analyze this health/medical media and provide a clear description and guidance."
          ],
          config: {
            systemInstruction: OGOO_SYSTEM_INSTRUCTION
          }
        });
      } catch (firstErr: any) {
        console.warn("Analyze media failed, trying fallback model:", firstErr);
        if (firstErr.status === 401 || firstErr.message?.includes('UNAUTHENTICATED')) {
          throw firstErr;
        }
        
        model = "gemini-3.1-flash-lite";
        response = await currentAi.models.generateContent({
          model,
          contents: [
            { inlineData: { data: base64, mimeType: file.mimetype || "application/octet-stream" } },
            prompt || "Analyze this health/medical media and provide a clear description and guidance."
          ],
          config: {
            systemInstruction: OGOO_SYSTEM_INSTRUCTION
          }
        });
      }

      fs.unlinkSync(file.filepath); // cleanup
      res.json({ reply: response.text });
    } catch (e: any) {
      console.error("Analyze media error:", e);
      if (e?.status === 429 || e?.message?.includes("429") || e?.message?.includes("Quota exceeded")) {
        return res.status(429).json({ error: "You've exceeded your quota for this model. Please try a simpler request or check your billing plan." });
      }
      
      let errorMsg = e.message || "Failed to process media.";
      if (e?.status === 401 || errorMsg.includes("UNAUTHENTICATED")) {
        errorMsg = "The Gemini API key is missing or invalid. Please update it in Settings > Secrets.";
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
