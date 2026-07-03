const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf-8');

// Replace Express and other Node.js imports
content = content.replace(/import express from "express";/, "import AsyncStorage from '@react-native-async-storage/async-storage';");
content = content.replace(/import path from "path";/g, '');
content = content.replace(/import \{ createServer as createViteServer \} from "vite";/g, '');
content = content.replace(/import \{ WebSocketServer \} from "ws";/g, '');
content = content.replace(/import http from "http";/g, '');
content = content.replace(/import formidable from "formidable";/g, '');
content = content.replace(/import fs from "fs";/g, '');

// DB initialization
content = content.replace('const DB_FILE = path.join(process.cwd(), "ogoo_users_db.json");', "const DB_KEY = 'ogoo_users_db';");

const loadDbOld = `function loadDb(): Record<string, UserRecord> {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load users DB:", e);
  }
  return {};
}`;
const loadDbNew = `async function loadDb(): Promise<Record<string, UserRecord>> {
  try {
    const data = await AsyncStorage.getItem(DB_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load users DB:", e);
  }
  return {};
}`;
content = content.replace(loadDbOld, loadDbNew);

const saveDbOld = `function saveDb(db: Record<string, UserRecord>) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save users DB:", e);
  }
}`;
const saveDbNew = `async function saveDb(db: Record<string, UserRecord>) {
  try {
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("Failed to save users DB:", e);
  }
}`;
content = content.replace(saveDbOld, saveDbNew);

// We will also replace the app.post definitions using regular expressions more robustly.
const regex = /app\.post\("\/api\/([a-zA-Z0-9\-]+)",\s*(async\s+)?\(req,\s*res\)\s*=>\s*\{([\s\S]*?)\}\);\n/g;

content = content.replace(regex, (match, route, isAsync, body) => {
    // Camel case the route
    const funcName = route.split('-').map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join('');
    
    // Inside the body, replace req.body with our simulated req
    const header = `export async function ${funcName}(reqBody: any): Promise<any> {
    const req = { body: reqBody };
    let responseData: any = null;
    const res = {
        json: (data: any) => { responseData = data; return data; },
        status: (code: number) => ({ json: (data: any) => { responseData = { error: data, status: code }; return responseData; } })
    };
`;
    // Find all 'db = loadDb()' and 'saveDb(db)' and make them await
    let newBody = body.replace(/const db = loadDb\(\);/g, 'const db = await loadDb();');
    newBody = newBody.replace(/saveDb\(db\);/g, 'await saveDb(db);');
    
    // We also need to return responseData at the end of this function body
    const footer = `\n    return responseData;\n}\n`;
    
    return header + newBody + footer;
});

// Remove setup boilerplate
content = content.replace(/const app = express\(\);/g, '');
content = content.replace(/const server = http\.createServer\(app\);/g, '');
content = content.replace(/const PORT = 3000;/g, '');

content = content.replace(/app\.use\(\(req, res, next\) => \{[\s\S]*?\}\);/g, '');

// handleUpload fix
content = content.replace(/const handleUpload = \([\s\S]*?\};/g, 'const handleUpload = async (req: any) => ({ fields: req.body, files: req.body.files });');

// fileToBase64 fix
content = content.replace(/const fileToBase64 = \([\s\S]*?\};/g, 'const fileToBase64 = (filepath: string) => filepath;');

// unlinkSync fix
content = content.replace(/fs\.unlinkSync\(file\.filepath\);/g, '');

// Vite middleware and listen fix
content = content.replace(/\/\/ Vite middleware for development[\s\S]*?\}\nstartServer\(\);/g, '');

content = content.replace(/async function startServer\(\) \{/, '');

fs.writeFileSync('server.native.ts', content);
