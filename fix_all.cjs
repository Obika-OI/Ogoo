const fs = require('fs');

let app = fs.readFileSync('App.tsx', 'utf-8');

// Replace the imports if not there
if (!app.includes('server.native')) {
    app = app.replace("import {", "import { userInit, userUpdateMetrics, backendChat, generatePlan, userClear } from './server.native';\nimport {");
}

// Write a simple string search to find the fetch blocks and replace them.
// In App.tsx, they look like this:
/*
        const initRes = await fetch(currentServerUrl + '/api/user/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: id, location: loc })
        });
*/

function replaceFetch(appStr, apiPath, funcName) {
    let searchIdx = 0;
    while ((searchIdx = appStr.indexOf(apiPath, searchIdx)) !== -1) {
        // find 'await fetch(' before this
        const fetchIdx = appStr.lastIndexOf('await fetch(', searchIdx);
        if (fetchIdx !== -1 && searchIdx - fetchIdx < 100) {
            // find the body: JSON.stringify( ... )
            const bodyIdx = appStr.indexOf('body: JSON.stringify(', searchIdx);
            if (bodyIdx !== -1) {
                let braceCount = 1;
                let pos = bodyIdx + 'body: JSON.stringify('.length;
                const startPos = pos;
                while (braceCount > 0 && pos < appStr.length) {
                    if (appStr[pos] === '(') braceCount++;
                    else if (appStr[pos] === ')') braceCount--;
                    pos++;
                }
                const bodyContent = appStr.substring(startPos, pos - 1);
                
                // find the closing `});` for the fetch block
                const endFetchIdx = appStr.indexOf('})', pos);
                if (endFetchIdx !== -1) {
                    // Let's replace the whole fetch block from `await fetch(` to `})` (or `});`)
                    let finalEnd = endFetchIdx + 2;
                    if (appStr.substring(finalEnd, finalEnd + 1) === ';') finalEnd++;
                    else if (appStr.substring(finalEnd, finalEnd + 2) === ');') finalEnd += 2;
                    
                    const replacement = `await ${funcName}(${bodyContent})`;
                    
                    appStr = appStr.substring(0, fetchIdx) + replacement + appStr.substring(finalEnd);
                    searchIdx = fetchIdx + replacement.length;
                }
            }
        }
        searchIdx += apiPath.length;
    }
    return appStr;
}

app = replaceFetch(app, "'/api/user/init'", 'userInit');
app = replaceFetch(app, "'/api/user/update-metrics'", 'userUpdateMetrics');
app = replaceFetch(app, "'/api/chat'", 'backendChat');
app = replaceFetch(app, "'/api/generate-plan'", 'generatePlan');
app = replaceFetch(app, "'/api/user/clear'", 'userClear');

fs.writeFileSync('App.tsx', app);

// Now update server.native.ts to return fetch-compatible responses

let serverNative = fs.readFileSync('server.native.ts', 'utf-8');

// Replace `return { profile: userRecord };` with `return { ok: true, json: async () => ({ profile: userRecord }) };`
// Actually, it's easier to just wrap all the returned objects inside server.native.ts
serverNative = serverNative.replace(/export async function userInit/g, "export async function userInit(reqBody: any): Promise<any> {\n    const data = await _userInit(reqBody);\n    return { ok: !data.error, json: async () => data };\n}\nasync function _userInit");
serverNative = serverNative.replace(/export async function userClear/g, "export async function userClear(reqBody: any): Promise<any> {\n    const data = await _userClear(reqBody);\n    return { ok: !data.error, json: async () => data };\n}\nasync function _userClear");
serverNative = serverNative.replace(/export async function userUpdateMetrics/g, "export async function userUpdateMetrics(reqBody: any): Promise<any> {\n    const data = await _userUpdateMetrics(reqBody);\n    return { ok: !data.error, json: async () => data };\n}\nasync function _userUpdateMetrics");
serverNative = serverNative.replace(/export async function chat/g, "export async function backendChat(reqBody: any): Promise<any> {\n    const data = await _chat(reqBody);\n    return { ok: !data.error, json: async () => data };\n}\nasync function _chat");
serverNative = serverNative.replace(/export async function generatePlan/g, "export async function generatePlan(reqBody: any): Promise<any> {\n    const data = await _generatePlan(reqBody);\n    return { ok: !data.error, json: async () => data };\n}\nasync function _generatePlan");
serverNative = serverNative.replace(/export async function analyzeMedia/g, "export async function analyzeMedia(reqBody: any): Promise<any> {\n    const data = await _analyzeMedia(reqBody);\n    return { ok: !data.error, json: async () => data };\n}\nasync function _analyzeMedia");

fs.writeFileSync('server.native.ts', serverNative);
