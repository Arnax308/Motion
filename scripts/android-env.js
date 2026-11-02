// Where the Android toolchain lives, and the environment Gradle and sdkmanager need.
// An existing JAVA_HOME / ANDROID_HOME (e.g. from Android Studio) takes priority.
const fs = require('fs');
const path = require('path');

const LOCAL = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
const TOOLCHAIN_DIR = path.join(LOCAL, 'MotionBuild');
const JDK_DIR = path.join(TOOLCHAIN_DIR, 'jdk');
const SDK_DIR = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(LOCAL, 'Android', 'Sdk');

function javaHome() {
  const candidates = [process.env.JAVA_HOME, JDK_DIR].filter(Boolean);
  return candidates.find(dir => fs.existsSync(path.join(dir, 'bin', 'java.exe')) || fs.existsSync(path.join(dir, 'bin', 'java'))) || null;
}

function buildEnv() {
  const java = javaHome();
  const extra = {
    ANDROID_HOME: SDK_DIR,
    ANDROID_SDK_ROOT: SDK_DIR
  };
  if (java) extra.JAVA_HOME = java;
  const pathParts = [java && path.join(java, 'bin'), path.join(SDK_DIR, 'platform-tools')].filter(Boolean);
  return Object.assign({}, process.env, extra, { PATH: pathParts.concat(process.env.PATH).join(path.delimiter) });
}

module.exports = { TOOLCHAIN_DIR, JDK_DIR, SDK_DIR, javaHome, buildEnv };
