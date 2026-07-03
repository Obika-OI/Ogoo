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
content = content.replace('const app = express();', '')
content = content.replace('const server = http.createServer(app);', '')
content = content.replace('const PORT = 3000;', '')

# We will regex match the route contents and create exported async functions instead
# For example: app.post("/api/chat", async (req, res) => { ... });

routes = [
    ("/api/user/init", "userInit"),
    ("/api/user/clear", "userClear"),
    ("/api/user/update-metrics", "userUpdateMetrics"),
    ("/api/chat", "chat"),
    ("/api/generate-plan", "generatePlan"),
    ("/api/analyze-media", "analyzeMedia")
]

for route, func_name in routes:
    # Use regex to find app.post(route, (req, res) => { ... })
    pattern = r'app\.post\("' + re.escape(route) + r'",\s*(async\s+)?\(req,\s*res\)\s*=>\s*\{'
    
    def replacer(match):
        return f"export async function {func_name}(reqBody: any) {{\n  const req = {{ body: reqBody }};\n  let responseData: any = null;\n  const res = {{\n    json: (data: any) => {{ responseData = data; return data; }},\n    status: (code: number) => ({{ json: (data: any) => {{ responseData = {{ error: data, status: code }}; return responseData; }} }})\n  }};"
    
    content = re.sub(pattern, replacer, content)


content = content.replace('app.use((req, res, next) => {', '/*\napp.use((req, res, next) => {')
content = content.replace('  if (req.method === \'OPTIONS\') {\n    return res.sendStatus(200);\n  }\n  next();\n});', '  if (req.method === \'OPTIONS\') {\n    return res.sendStatus(200);\n  }\n  next();\n});\n*/')

content = re.sub(r'const handleUpload.*?\};', 'const handleUpload = async (req: any) => ({ fields: req.body, files: req.body.files });', content, flags=re.DOTALL)
content = content.replace('const fileToBase64 = (filepath: string) => {\n    return fs.readFileSync(filepath).toString(\'base64\');\n  };', 'const fileToBase64 = (filepath: string) => filepath;')
content = content.replace('fs.unlinkSync(file.filepath); // cleanup', '')

# Vite middleware
content = re.sub(r'// Vite middleware for development.*', '', content, flags=re.DOTALL)
content = re.sub(r'startServer\(\);', '', content)
content = content.replace('async function startServer() {', '')
content = content.replace('export async function startServer() {', '')

with open('server.native.ts', 'w') as f:
    f.write(content)
