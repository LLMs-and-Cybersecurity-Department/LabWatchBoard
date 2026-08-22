import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const liveBuildEnvironment = {
  ...process.env,
  ECMWF_PBOARD_LIVE_BUILD: "1",
};

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, script), ...args], {
      cwd: root,
      env: liveBuildEnvironment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`子进程被信号 ${signal} 中止`));
        return;
      }
      code === 0 ? resolve() : reject(new Error(`子进程退出码 ${code ?? "未知"}`));
    });
  });
}

try {
  await run("node_modules/typescript/bin/tsc", ["-b"]);
  await run("node_modules/vite/bin/vite.js", ["build"]);
} catch (error) {
  console.error(`在线构建失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
