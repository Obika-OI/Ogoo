const fs = require('fs');

let content = fs.readFileSync('App.tsx', 'utf-8');

const regexChat = /const response = await fetch\(serverUrl \+ '\/api\/chat', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(([\s\S]*?)\)\s*\}\);/g;
content = content.replace(regexChat, "const response = await backendChat($1);");

const regexPlan = /const response = await fetch\(serverUrl \+ '\/api\/generate-plan', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(([\s\S]*?)\)\s*\}\);/g;
content = content.replace(regexPlan, "const response = await generatePlan($1);");

content = content.replace(/const initRes = await fetch\(currentServerUrl \+ '\/api\/user\/init'/g, "// const initRes = await fetch(currentServerUrl + '/api/user/init'");
content = content.replace(/const initRes = await fetch\(serverUrl \+ '\/api\/user\/init'/g, "// const initRes = await fetch(serverUrl + '/api/user/init'");

fs.writeFileSync('App.tsx', content);
