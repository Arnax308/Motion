// Builds the Android debug APK: web bundle → Capacitor sync → Gradle. Output: dist/Motion.apk
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const env = require('./android-env');

const ROOT = path.join(__dirname, '..');
const run = (cmd, cwd) => execSync(cmd, { cwd: cwd || ROOT, stdio: 'inherit', env: env.buildEnv() });

if (!env.javaHome()) {
  console.error('No JDK found. Run: npm run setup:android');
  process.exit(1);
}
// Gradle reads local.properties as a Java properties file, where backslashes must be doubled
fs.writeFileSync(path.join(ROOT, 'android', 'local.properties'), `sdk.dir=${env.SDK_DIR.split('\\').join('\\\\')}\n`);

run('node scripts/build-web.js');
run('npx cap sync android');
const androidDir = path.join(ROOT, 'android');
run(`"${path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}" assembleDebug`, androidDir);

const apk = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.copyFileSync(apk, path.join(ROOT, 'dist', 'Motion.apk'));
console.log(`\nAPK ready: ${path.join(ROOT, 'dist', 'Motion.apk')}`);
