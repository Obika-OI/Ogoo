const fs = require('fs');

let content = fs.readFileSync('App.tsx', 'utf-8');

// Add imports
content = content.replace("import {", "import { userInit, userUpdateMetrics, chat as backendChat, generatePlan, userClear } from './server.native';\nimport {");

// Replace fetch(/api/user/update-metrics)
content = content.replace(/await fetch\(serverUrl \+ '\/api\/user\/update-metrics', \{[\s\S]*?body: JSON.stringify\(([\s\S]*?)\)\n\s*\}\);/g, 
  "await userUpdateMetrics($1);");

// Replace fetch(/api/user/init)
content = content.replace(/await fetch\(currentServerUrl \+ '\/api\/user\/init', \{[\s\S]*?body: JSON.stringify\(([\s\S]*?)\)\n\s*\}\);/g, 
  "await userInit($1);");
content = content.replace(/await fetch\(serverUrl \+ '\/api\/user\/init', \{[\s\S]*?body: JSON.stringify\(([\s\S]*?)\)\n\s*\}\);/g, 
  "await userInit($1);");

// Replace fetch(/api/chat)
content = content.replace(/const response = await fetch\(serverUrl \+ '\/api\/chat', \{[\s\S]*?body: JSON.stringify\(([\s\S]*?)\)\n\s*\}\);/g, 
  "const response = await backendChat($1);");
// Fix parsing response
content = content.replace(/const data = await response.json\(\);/g, "const data = response;"); // since response is already an object
content = content.replace(/if \(!response.ok\)/g, "if (response.error)");


// Replace fetch(/api/generate-plan)
content = content.replace(/const response = await fetch\(serverUrl \+ '\/api\/generate-plan', \{[\s\S]*?body: JSON.stringify\(([\s\S]*?)\)\n\s*\}\);/g, 
  "const response = await generatePlan($1);");

// Replace fetch(/api/user/clear) if any
content = content.replace(/await fetch\(serverUrl \+ '\/api\/user\/clear', \{[\s\S]*?body: JSON.stringify\(([\s\S]*?)\)\n\s*\}\);/g, 
  "await userClear($1);");

fs.writeFileSync('App.tsx', content);
