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

content = content.replace('const db = loadDb();', 'const db = await loadDb();')
content = content.replace('saveDb(db);', 'await saveDb(db);')

def replacer(match):
    path = match.group(1)
    is_async = match.group(2)
    # Convert path like user/update-metrics to userUpdateMetrics
    func_name = ''.join(word.capitalize() for word in path.replace('-', '/').split('/'))
    func_name = func_name[0].lower() + func_name[1:]
    
    return f"export async function {func_name}(reqBody: any) {{\n    try {{\n      const req = {{ body: reqBody }};\n      let responseData: any = null;\n      const res = {{\n        json: (data: any) => {{ responseData = data; return data; }},\n        status: (code: number) => ({{ json: (data: any) => {{ responseData = {{ error: data, status: code }}; return responseData; }} }})\n      }};"

content = re.sub(r'app\.post\("/api/([^"]+)",\s*(async\s+)?\(req, res\)\s*=>\s*\{', replacer, content)

content = content.replace('const app = express();', '')
content = content.replace('const server = http.createServer(app);', '')
content = content.replace('const PORT = 3000;', '')

# Fix handleUpload and formidable
content = re.sub(r'const handleUpload.*?\};', 'const handleUpload = async (req: any) => ({ fields: req.body, files: req.body.files });', content, flags=re.DOTALL)
content = content.replace('const fileToBase64 = (filepath: string) => {\n    return fs.readFileSync(filepath).toString(\'base64\');\n  };', 'const fileToBase64 = (filepath: string) => filepath;')
content = content.replace('fs.unlinkSync(file.filepath); // cleanup', '')

# Remove server.listen and vite middleware
content = re.sub(r'// Vite middleware for development.*', '', content, flags=re.DOTALL)
content = re.sub(r'startServer\(\);', '', content)
content = content.replace('async function startServer() {', '')
content = content.replace('export async function startServer() {', '')

# Remove trailing closing brace from startServer
content = content.strip()
if content.endswith('}'):
    content = content[:-1]

with open('server.native.ts', 'w') as f:
    f.write(content)

