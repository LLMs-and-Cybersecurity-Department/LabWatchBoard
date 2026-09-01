import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const requiredFiles = [
  "dist/index.html",
  "desktop-dist/main.mjs",
  "electron-builder.yml",
  "capacitor.config.ts",
];

for (const file of requiredFiles) {
  const details = await stat(file).catch(() => null);
  if (!details?.isFile()) throw new Error(`缺少发布输入：${file}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const releaseInputs = [...await walk("dist"), ...await walk("desktop-dist")];
const forbidden = releaseInputs.filter((file) => /\.(?:map|tsx?|jsx)$/.test(file));
if (forbidden.length) throw new Error(`发布输入包含源码或 source map：${forbidden.join(", ")}`);

const forbiddenCredentialFiles = releaseInputs.filter((file) => {
  const name = path.basename(file).toLowerCase();
  return name === ".env" || name.startsWith(".env.") || /\.(?:pem|key|p12|pfx)$/.test(name);
});
if (forbiddenCredentialFiles.length) {
  throw new Error(`发布输入包含凭据文件：${forbiddenCredentialFiles.join(", ")}`);
}

const localSecretValues = [];
for (const environmentFile of [".env", ".env.local"]) {
  const content = await readFile(environmentFile, "utf8").catch(() => "");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|APP_ID)[A-Z0-9_]*)\s*=\s*(.+?)\s*$/i);
    if (!match) continue;
    const value = match[2].replace(/^(?:['"])(.*)(?:['"])$/, "$1").trim();
    if (value.length >= 8) localSecretValues.push({ key: match[1], value });
  }
}

for (const file of releaseInputs) {
  const buffer = await readFile(file);
  const content = buffer.toString("utf8");
  if (/\bsk-[A-Za-z0-9_-]{16,}\b/.test(content)) {
    throw new Error(`发布输入疑似包含原始 API Key：${file}`);
  }
  const exposed = localSecretValues.find(({ value }) => content.includes(value));
  if (exposed) throw new Error(`发布输入包含本机凭据 ${exposed.key}：${file}`);
}

const desktopRuntime = await readFile("desktop-dist/main.mjs", "utf8");
if (desktopRuntime.includes("sourceMappingURL=")) throw new Error("桌面运行时仍包含 source map 引用");

console.log(`Release inputs verified: ${releaseInputs.length} files, no source maps, source files, credential files, or local secret values.`);
