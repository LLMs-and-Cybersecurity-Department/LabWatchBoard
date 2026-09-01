import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pnpmStoreDirectory = path.resolve("node_modules/.pnpm");
const asarPackageDirectory = (await readdir(pnpmStoreDirectory))
  .filter((name) => name.startsWith("@electron+asar@"))
  .sort()
  .at(-1);
if (!asarPackageDirectory) throw new Error("@electron/asar is not installed in the pnpm store");
const asarModulePath = path.join(
  pnpmStoreDirectory,
  asarPackageDirectory,
  "node_modules/@electron/asar/lib/asar.js",
);
const { extractAll } = require(asarModulePath);

const unpackedDirectory = path.resolve("release/win-unpacked");
const executablePath = path.join(unpackedDirectory, "LabWatch.exe");
const asarPath = path.join(unpackedDirectory, "resources/app.asar");

for (const requiredPath of [executablePath, asarPath]) {
  const details = await stat(requiredPath).catch(() => null);
  if (!details?.isFile()) throw new Error(`Missing Windows release input: ${requiredPath}`);
}

function parseLocalSecrets(content) {
  const values = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|APP_?ID)[A-Z0-9_]*)\s*=\s*(.+?)\s*$/i,
    );
    if (!match) continue;
    const value = match[2].replace(/^(?:['"])(.*)(?:['"])$/, "$1").trim();
    if (value.length >= 8) values.push({ key: match[1], value });
  }
  return values;
}

const localSecrets = [];
for (const environmentFile of [".env", ".env.local"]) {
  const content = await readFile(environmentFile, "utf8").catch(() => "");
  localSecrets.push(...parseLocalSecrets(content));
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else files.push(entryPath);
  }
  return files;
}

const extractedDirectory = await mkdtemp(path.join(tmpdir(), "labwatch-asar-audit-"));
try {
  extractAll(asarPath, extractedDirectory);
  const packagedFiles = await walk(extractedDirectory);
  const forbiddenNames = packagedFiles.filter((file) => {
    const relative = path.relative(extractedDirectory, file).replaceAll(path.sep, "/");
    const name = path.basename(relative).toLowerCase();
    return (
      name === ".env" ||
      name.startsWith(".env.") ||
      /\.(?:pem|key|p12|pfx|map|tsx?|jsx)$/.test(name)
    );
  });
  if (forbiddenNames.length) {
    throw new Error(`Packaged app contains forbidden files: ${forbiddenNames.join(", ")}`);
  }

  for (const file of packagedFiles) {
    const buffer = await readFile(file);
    const content = buffer.toString("utf8");
    if (/\bsk-[A-Za-z0-9_-]{16,}\b/.test(content)) {
      throw new Error(`Packaged app appears to contain an API key: ${file}`);
    }
    const exposed = localSecrets.find(({ value }) => content.includes(value));
    if (exposed) {
      throw new Error(`Packaged app contains local credential ${exposed.key}: ${file}`);
    }
  }

  console.log(
    `Windows release verified: ${packagedFiles.length} app.asar files, no credentials, env files, source maps, or source files.`,
  );
} finally {
  await rm(extractedDirectory, { recursive: true, force: true });
}
