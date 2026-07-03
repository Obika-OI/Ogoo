with open('server.native.ts', 'r') as f:
    content = f.read()

content = content.replace('const db = loadDb();', 'const db = await loadDb();')
content = content.replace('saveDb(db);', 'await saveDb(db);')

with open('server.native.ts', 'w') as f:
    f.write(content)
