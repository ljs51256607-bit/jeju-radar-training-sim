import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const sourceTargets = [
  path.join(rootDir, "src"),
  path.join(rootDir, "scripts"),
  path.join(rootDir, "vite.config.ts"),
  path.join(rootDir, "package.json")
];

const bannedPatterns = [
  { label: "API key environment marker", regex: new RegExp(["OPENAI", "API", "KEY"].join("_"), "i") },
  { label: "local API key file marker", regex: new RegExp(["OPEN", "AI", "API", "KEY"].join(" "), "i") },
  { label: "provider key pattern", regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ }
];

if (!existsSync(distDir)) {
  throw new Error(`Missing dist directory. Run npm run build first: ${distDir}`);
}

const files = await listFiles(distDir);

for (const file of files) {
  if (!isTextLike(file)) {
    continue;
  }

  const contents = readFileSync(file, "utf8");

  for (const pattern of bannedPatterns) {
    if (pattern.regex.test(contents)) {
      throw new Error(`Bundle hygiene scan failed: ${pattern.label} found in ${file}`);
    }
  }
}

const sourceFiles = [];
for (const sourceTarget of sourceTargets) {
  if (!existsSync(sourceTarget)) {
    continue;
  }

  const stat = statSync(sourceTarget);
  if (stat.isDirectory()) {
    sourceFiles.push(...(await listFiles(sourceTarget)));
  } else if (stat.isFile()) {
    sourceFiles.push(sourceTarget);
  }
}

const secretKeyPattern = /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/;
for (const file of sourceFiles) {
  if (!isTextLike(file)) {
    continue;
  }

  const contents = readFileSync(file, "utf8");
  if (secretKeyPattern.test(contents)) {
    throw new Error(`Source hygiene scan failed: provider key pattern found in ${file}`);
  }
}

console.log(`Bundle hygiene scan passed (${files.length} bundle files, ${sourceFiles.length} source files checked)`);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile() && statSync(fullPath).size <= 1024 * 1024) {
      files.push(fullPath);
    }
  }

  return files;
}

function isTextLike(file) {
  return /\.(html|js|css|json|txt|map|svg)$/i.test(file);
}
