#!/usr/bin/env node
// PostToolUse hook: after every Edit/Write/MultiEdit on src/App.jsx, save a
// sequentially-numbered copy in backups/ so changes are locally reversible
// without needing git. Counter persists in backups/.counter across sessions.
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');
    const filePath = data.tool_input && data.tool_input.file_path;
    if (!filePath || path.basename(filePath) !== 'App.jsx' || !fs.existsSync(filePath)) {
      process.exit(0);
    }

    const projectRoot = path.resolve(__dirname, '..', '..');
    const backupsDir = path.join(projectRoot, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });

    const counterFile = path.join(backupsDir, '.counter');
    let n = 0;
    if (fs.existsSync(counterFile)) {
      n = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10) || 0;
    }
    n += 1;
    fs.writeFileSync(counterFile, String(n));

    const padded = String(n).padStart(4, '0');
    const destName = `App_${padded}.jsx`;
    fs.copyFileSync(filePath, path.join(backupsDir, destName));

    process.stdout.write(JSON.stringify({
      systemMessage: `Backup guardado: backups/${destName} (secuencia ${n})`,
    }));
  } catch (e) {
    process.stdout.write(JSON.stringify({
      systemMessage: `Backup hook error: ${e.message}`,
    }));
  }
});
