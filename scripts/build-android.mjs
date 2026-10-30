/**
 * One-command Android build:
 *   npm run apk          -> apk/TeaRush-debug.apk    (installable test build)
 *   npm run apk:release  -> apk/TeaRush-release.apk  (signed, for sharing/sideloading)
 *   npm run aab          -> apk/TeaRush-release.aab  (signed bundle for Google Play)
 *
 * Builds the Angular app, syncs it into the Capacitor Android project, then runs Gradle.
 * Finds Android Studio's bundled JDK and the Android SDK automatically when
 * JAVA_HOME / ANDROID_HOME aren't set.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const mode = process.argv[2] ?? 'debug';
const isWindows = process.platform === 'win32';

const TASKS = {
  debug: { task: 'assembleDebug', output: 'app/build/outputs/apk/debug/app-debug.apk', name: 'TeaRush-debug.apk' },
  release: { task: 'assembleRelease', output: 'app/build/outputs/apk/release/app-release.apk', name: 'TeaRush-release.apk' },
  bundle: { task: 'bundleRelease', output: 'app/build/outputs/bundle/release/app-release.aab', name: 'TeaRush-release.aab' },
};
const target = TASKS[mode];
if (!target) {
  console.error(`Unknown mode "${mode}". Use debug, release or bundle.`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const line = `${command} ${args.join(' ')}`;
  console.log(`\n> ${line}`);
  // Windows needs a shell to run npx/.bat files; pass one command string (args here never contain spaces).
  const result = isWindows
    ? spawnSync(line, { stdio: 'inherit', shell: true, ...options })
    : spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    console.error(`\n✖ "${command} ${args.join(' ')}" failed.`);
    process.exit(result.status ?? 1);
  }
}

function firstExisting(paths) {
  return paths.find((p) => p && fs.existsSync(p));
}

// --- Java: Gradle needs JDK 17+ (Android Studio ships one; any full JDK 21 works too).
/** A JDK folder is usable only if it's complete (a half-updated Android Studio leaves a broken jbr). */
const isJdk = (dir) =>
  Boolean(dir) && fs.existsSync(path.join(dir, 'bin', isWindows ? 'java.exe' : 'java')) && fs.existsSync(path.join(dir, 'lib', 'jvm.cfg'));

/** JDK folders under e.g. "C:\Program Files\Eclipse Adoptium\jdk-21…". */
const jdksIn = (parent) =>
  fs.existsSync(parent) ? fs.readdirSync(parent).filter((d) => /^jdk-?(1[7-9]|2\d)/.test(d)).sort().reverse().map((d) => path.join(parent, d)) : [];

/** The JDK that owns the `java` on PATH, if any. */
function javaHomeFromPath() {
  const which = spawnSync(isWindows ? 'where' : 'which', ['java'], { encoding: 'utf8', shell: isWindows });
  const javaExe = which.stdout?.split(/\r?\n/).find(Boolean);
  return javaExe ? path.dirname(path.dirname(javaExe)) : null;
}

const env = { ...process.env };
if (!isJdk(env.JAVA_HOME)) {
  const local = path.join(os.homedir(), 'AppData', 'Local', 'Programs');
  const jdk = [
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    path.join(local, 'Android Studio', 'jbr'),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    path.join(os.homedir(), 'android-studio', 'jbr'),
    '/opt/android-studio/jbr',
    ...jdksIn(path.join(local, 'Eclipse Adoptium')),
    ...jdksIn('C:\\Program Files\\Eclipse Adoptium'),
    ...jdksIn('C:\\Program Files\\Java'),
    ...jdksIn('C:\\Program Files\\Microsoft'),
    javaHomeFromPath(),
  ].find(isJdk);
  if (jdk) {
    env.JAVA_HOME = jdk;
    console.log(`Using JDK: ${jdk}`);
  } else {
    console.error('No complete Java JDK (17+) found. Install Android Studio or a JDK such as Eclipse Temurin 21.');
    process.exit(1);
  }
}

// --- Android SDK location -> android/local.properties
const sdk = firstExisting([
  env.ANDROID_HOME,
  env.ANDROID_SDK_ROOT,
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  path.join(os.homedir(), 'Android', 'Sdk'),
]);
const localProps = path.join(androidDir, 'local.properties');
if (sdk && !fs.existsSync(localProps)) {
  fs.writeFileSync(localProps, `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);
  console.log(`Wrote android/local.properties (sdk.dir=${sdk})`);
}
if (!sdk && !fs.existsSync(localProps)) {
  console.error('Android SDK not found. Install Android Studio, or set ANDROID_HOME.');
  process.exit(1);
}

if (mode !== 'debug' && !fs.existsSync(path.join(androidDir, 'keystore.properties'))) {
  console.error(
    '\nRelease builds must be signed. Create a keystore first (see README → "Signing a release build"),\n' +
      'then add android/keystore.properties with storeFile, storePassword, keyAlias and keyPassword.'
  );
  process.exit(1);
}

/**
 * Capacitor 8 uses Android Gradle Plugin 8.13, which only works with Gradle 8.x.
 * Some editor extensions silently "upgrade" the wrapper to Gradle 9.x, which
 * breaks the build — put it back if that happened.
 */
const GRADLE_VERSION = '8.14.3';
function ensureGradleWrapper() {
  const file = path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  const text = fs.readFileSync(file, 'utf8');
  const current = text.match(/gradle-([\d.]+)-(?:all|bin)\.zip/)?.[1];
  if (current && current.startsWith('8.')) return;
  fs.writeFileSync(
    file,
    text.replace(/distributionUrl=.*/, `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-all.zip`)
  );
  console.log(`Reset Gradle wrapper from ${current ?? 'unknown'} to ${GRADLE_VERSION} (required by Capacitor 8).`);
}

// --- Build web app, sync into Android, run Gradle.
run('npx', ['ng', 'build', '--configuration', 'production'], { cwd: root });
run('npx', ['cap', 'sync', 'android'], { cwd: root });
ensureGradleWrapper();
run(isWindows ? '.\\gradlew.bat' : './gradlew', [target.task, '--no-daemon'], { cwd: androidDir, env });

const built = path.join(androidDir, target.output);
const outDir = path.join(root, 'apk');
fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, target.name);
fs.copyFileSync(built, dest);
const sizeMb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`\n✔ Built ${path.relative(root, dest)} (${sizeMb} MB)`);
