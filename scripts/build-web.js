// Builds www/ for the Android app: the same page, scripts and styles the Electron app uses,
// plus only the font and icon files it references, plus the background runner bundle.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');

require('./ensure-config');

function copy(rel) {
  const from = path.join(ROOT, rel);
  const to = path.join(WWW, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

// A stylesheet plus every url(...) file it points at
function copyCssWithAssets(rel) {
  copy(rel);
  const css = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of css.matchAll(/url\(\s*['"]?([^'")?#]+)/g)) {
    if (/^(data:|https?:)/.test(m[1])) continue;
    const asset = path.join(path.dirname(rel), m[1]);
    if (fs.existsSync(path.join(ROOT, asset))) copy(asset);
  }
}

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// Capacitor injects its bridge as an inline script, which a strict CSP would block
html = html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
fs.writeFileSync(path.join(WWW, 'index.html'), html);

['css', 'js'].forEach(copy);
for (const m of html.matchAll(/<link rel="stylesheet" href="(node_modules\/[^"]+)"/g)) copyCssWithAssets(m[1]);

const runner = ['js/engine.js', 'js/sync-core.js', 'js/firestore.js', 'js/alerts-core.js', 'runners/background-main.js']
  .map(f => `// ---- ${f}\n${fs.readFileSync(path.join(ROOT, f), 'utf8')}`)
  .join('\n');
fs.mkdirSync(path.join(WWW, 'runners'), { recursive: true });
fs.writeFileSync(path.join(WWW, 'runners', 'background.js'), runner);

console.log('Built www/');
