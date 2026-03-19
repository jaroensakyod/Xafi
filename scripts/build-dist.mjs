import { mkdir, readFile, rm, writeFile, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const copyFiles = [
  'manifest.json',
  'sidepanel.html',
  'sidepanel.css',
  'results.html',
  'results.css',
  'content_x.css',
];

const obfuscateFiles = [
  'background.js',
  'content_x.js',
  'content_ai.js',
  'sidepanel.js',
  'results.js',
];

const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: [],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.75,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const relativePath of copyFiles) {
    const sourcePath = path.join(projectRoot, relativePath);
    const destPath = path.join(distDir, relativePath);
    await ensureExists(sourcePath);
    await copyFile(sourcePath, destPath);
  }

  for (const relativePath of obfuscateFiles) {
    const sourcePath = path.join(projectRoot, relativePath);
    const destPath = path.join(distDir, relativePath);
    await ensureExists(sourcePath);
    const code = await readFile(sourcePath, 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(code, obfuscationOptions).getObfuscatedCode();
    await writeFile(destPath, obfuscated, 'utf8');
  }

  const manifestPath = path.join(distDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await validateManifestAssets(manifest);

  console.log(`Built obfuscated extension to ${distDir}`);
}

async function validateManifestAssets(manifest) {
  const requiredFiles = new Set();

  if (manifest.background?.service_worker) {
    requiredFiles.add(manifest.background.service_worker);
  }

  for (const scriptConfig of manifest.content_scripts || []) {
    for (const file of scriptConfig.js || []) {
      requiredFiles.add(file);
    }
    for (const file of scriptConfig.css || []) {
      requiredFiles.add(file);
    }
  }

  if (manifest.side_panel?.default_path) {
    requiredFiles.add(manifest.side_panel.default_path);
  }

  requiredFiles.add('results.html');
  requiredFiles.add('results.js');
  requiredFiles.add('results.css');
  requiredFiles.add('sidepanel.js');
  requiredFiles.add('sidepanel.css');

  for (const relativePath of requiredFiles) {
    await ensureExists(path.join(distDir, relativePath));
  }
}

async function ensureExists(filePath) {
  await access(filePath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});