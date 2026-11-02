// Makes sure js/sync-config.js exists so the app loads cleanly; without real values sync stays off
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'js', 'sync-config.js');
if (!fs.existsSync(file)) {
  fs.writeFileSync(file, '// Sync is off. See js/sync-config.example.js to turn it on.\nwindow.MotionSyncConfig = null;\n');
  console.log('Created js/sync-config.js with sync turned off');
}
