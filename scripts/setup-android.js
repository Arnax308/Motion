// One-time setup for building the Android app on Windows, without admin rights:
// a portable JDK 21 in %LOCALAPPDATA%\MotionBuild\jdk and the Android SDK in %LOCALAPPDATA%\Android\Sdk.
// Safe to re-run: finished steps are skipped.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const env = require('./android-env');

const JDK_URL = 'https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip';
const TOOLS_URL = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';
const PACKAGES = ['platform-tools', 'platforms;android-35', 'build-tools;35.0.0'];

// curl (built into Windows 10+) resumes and retries; large downloads through fetch can stall silently
const CURL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe');

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return; // reuse a finished download
  console.log(`Downloading ${url}`);
  const partial = dest + '.part';
  execFileSync(fs.existsSync(CURL) ? CURL : 'curl',
    ['-fL', '--retry', '5', '--retry-delay', '3', '-C', '-', '-o', partial, url], { stdio: 'inherit' });
  fs.renameSync(partial, dest);
}

// Windows' own bsdtar reads zip files; a GNU tar earlier on PATH (Git Bash) can't handle "C:" paths
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

function unzip(zip, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(fs.existsSync(TAR) ? TAR : 'tar', ['-xf', zip, '-C', dir], { stdio: 'inherit' });
}

async function setupJdk() {
  if (env.javaHome()) return console.log(`JDK ready: ${env.javaHome()}`);
  const tmp = path.join(env.TOOLCHAIN_DIR, 'jdk.zip');
  fs.mkdirSync(env.TOOLCHAIN_DIR, { recursive: true });
  await download(JDK_URL, tmp);
  const staging = path.join(env.TOOLCHAIN_DIR, 'jdk-staging');
  unzip(tmp, staging);
  // The zip holds one folder like jdk-21.0.x+y; move it to a fixed name
  const inner = fs.readdirSync(staging).find(n => n.startsWith('jdk'));
  fs.renameSync(path.join(staging, inner), env.JDK_DIR);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(tmp, { force: true });
  console.log(`JDK installed: ${env.JDK_DIR}`);
}

async function setupSdk() {
  const latest = path.join(env.SDK_DIR, 'cmdline-tools', 'latest');
  if (!fs.existsSync(path.join(latest, 'bin', 'sdkmanager.bat'))) {
    const tmp = path.join(env.TOOLCHAIN_DIR, 'cmdline-tools.zip');
    await download(TOOLS_URL, tmp);
    const staging = path.join(env.SDK_DIR, 'cmdline-tools', 'staging');
    unzip(tmp, staging);
    fs.renameSync(path.join(staging, 'cmdline-tools'), latest);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(tmp, { force: true });
  }
  const sdkmanager = path.join(latest, 'bin', 'sdkmanager.bat');
  const opts = { env: env.buildEnv(), shell: true, stdio: ['pipe', 'inherit', 'inherit'] };
  console.log('Accepting Android SDK licences');
  execFileSync(`"${sdkmanager}"`, ['--licenses'], Object.assign({}, opts, { input: 'y\n'.repeat(20) }));
  console.log(`Installing ${PACKAGES.join(', ')}`);
  execFileSync(`"${sdkmanager}"`, PACKAGES.map(p => `"${p}"`), opts);
  console.log(`Android SDK ready: ${env.SDK_DIR}`);
}

(async () => {
  await setupJdk();
  await setupSdk();
  console.log('Android toolchain is ready. Build the app with: npm run mobile:build');
})().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
