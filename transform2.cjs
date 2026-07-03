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


// We will replace 'const db = loadDb();' -> 'const db = await loadDb();' globally
content = content.replace(/const db = loadDb\(\);/g, 'const db = await loadDb();');
content = content.replace(/saveDb\(db\);/g, 'await saveDb(db);');


// Find app.post
let idx = 0;
while ((idx = content.indexOf('app.post("/api/', idx)) !== -1) {
    const startStr = content.substring(idx);
    const match = startStr.match(/^app\.post\("\/api\/([a-zA-Z0-9\-]+)",\s*(async\s+)?\(req,\s*res\)\s*=>\s*\{/);
    if (match) {
        const route = match[1];
        const isAsync = match[2];
        const funcName = route.split('-').map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join('');
        
        let braceCount = 1;
        let bodyStart = idx + match[0].length;
        let pos = bodyStart;
        while (braceCount > 0 && pos < content.length) {
            if (content[pos] === '{') braceCount++;
            else if (content[pos] === '}') braceCount--;
            pos++;
        }
        // pos is now just after the closing brace of the app.post block
        // The characters between bodyStart and pos - 1 are the body
        const body = content.substring(bodyStart, pos - 1);
        
        const header = `export async function ${funcName}(reqBody: any): Promise<any> {
    const req = { body: reqBody };
    let responseData: any = null;
    const res = {
        json: (data: any) => { responseData = data; return data; },
        status: (code: number) => ({ json: (data: any) => { responseData = { error: data, status: code }; return responseData; } })
    };
`;
        const footer = `\n    return responseData;\n}`;
        
        const replacement = header + body + footer;
        
        // now we need to also remove the ");" after the block
        let endPos = pos;
        if (content.substring(endPos, endPos + 2) === ');') {
            endPos += 2;
        }
        
        content = content.substring(0, idx) + replacement + content.substring(endPos);
        idx = idx + replacement.length;
    } else {
        idx += 10;
    }
}

// Remove setup boilerplate
content = content.replace(/const app = express\(\);/g, '');
content = content.replace(/const server = http\.createServer\(app\);/g, '');
content = content.replace(/const PORT = 3000;/g, '');
content = content.replace(/app\.use\(\(req, res, next\) => \{[\s\S]*?\}\);/g, '');

// handleUpload fix
const uploadRegex = /const handleUpload = \([\s\S]*?\};/g;
content = content.replace(uploadRegex, 'const handleUpload = async (req: any) => ({ fields: req.body, files: req.body.files });');

// fileToBase64 fix
const base64Regex = /const fileToBase64 = \([\s\S]*?\};/g;
content = content.replace(base64Regex, 'const fileToBase64 = (filepath: string) => filepath;');

// unlinkSync fix
content = content.replace(/fs\.unlinkSync\(file\.filepath\);/g, '');

// Vite middleware and listen fix
content = content.replace(/\/\/ Vite middleware for development[\s\S]*?\}\nstartServer\(\);/g, '');

content = content.replace(/async function startServer\(\) \{/, '');
// strip remaining trailing '}'
content = content.trim();
if (content.endsWith('}')) {
    content = content.substring(0, content.length - 1);
}

fs.writeFileSync('server.native.ts', content);
