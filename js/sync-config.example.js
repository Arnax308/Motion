// Copy this file to js/sync-config.js (which is gitignored) and fill it in to turn on sync.
// apiKey and projectId come from Firebase: Project settings → Your apps → Web app.
// syncKey is a long random secret shared by your devices; generate one with:
//   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
window.MotionSyncConfig = {
  apiKey: 'AIza...',
  projectId: 'your-project-id',
  syncKey: 'paste-a-48-character-random-hex-string-here'
};
