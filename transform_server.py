import re

with open('server.ts', 'r') as f:
    content = f.read()

# Replace fs operations with AsyncStorage
content = content.replace('import express from "express";', "import AsyncStorage from '@react-native-async-storage/async-storage';")
content = content.replace('import path from "path";', '')
content = content.replace('import { createServer as createViteServer } from "vite";', '')
content = content.replace('import { WebSocketServer } from "ws";', '')
content = content.replace('import http from "http";', '')
content = content.replace('import formidable from "formidable";', '')
content = content.replace('import fs from "fs";', '')

# Replace fs operations with async storage
content = content.replace('const DB_FILE = path.join(process.cwd(), "ogoo_users_db.json");', "const DB_KEY = 'ogoo_users_db';")

content = content.replace('''function loadDb(): Record<string, UserRecord> {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load users DB:", e);
  }
  return {};
}''', '''async function loadDb(): Promise<Record<string, UserRecord>> {
  try {
    const data = await AsyncStorage.getItem(DB_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load users DB:", e);
  }
  return {};
}''')

content = content.replace('''function saveDb(db: Record<string, UserRecord>) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save users DB:", e);
  }
}''', '''async function saveDb(db: Record<string, UserRecord>) {
  try {
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("Failed to save users DB:", e);
  }
}''')

# Convert app.post to exported async functions
content = re.sub(r'app\.post\("/api/([^"]+)", async \(req, res\) => \{', r'export async function \1(reqBody: any) { \n    try {\n      const req = { body: reqBody };\n      const res = {\n        json: (data: any) => data,\n        status: (code: number) => ({ json: (data: any) => ({ error: data, status: code }) })\n      };', content)

content = content.replace('const app = express();', '')
content = content.replace('const server = http.createServer(app);', '')
content = content.replace('const PORT = 3000;', '')

# Remove server.listen and vite middleware
content = re.sub(r'// Vite middleware for development.*', '', content, flags=re.DOTALL)

with open('server.native.ts', 'w') as f:
    f.write(content)

