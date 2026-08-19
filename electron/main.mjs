import { app, BrowserWindow, session, shell } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";

let mainWindow;
let stopProductionServer;

function isSafeExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function startLocalService() {
  try {
    process.loadEnvFile(path.join(app.getAppPath(), ".env.local"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const runtimeDirectory = path.join(app.getPath("userData"), "runtime");
  await mkdir(runtimeDirectory, { recursive: true });

  process.env.APP_ROOT = app.getAppPath();
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "0";
  process.env.EARTHQUAKE_SOURCE_SNAPSHOT_PATH = path.join(runtimeDirectory, "earthquake-source-snapshots.json");
  process.env.FDSN_STATION_CACHE_PATH = path.join(runtimeDirectory, "fdsn-stations.json");
  process.env.NIED_STATION_CACHE_PATH = path.join(runtimeDirectory, "nied-stations.json");
  process.env.OCEAN_STATION_CACHE_PATH = path.join(runtimeDirectory, "ocean-stations.json");
  process.env.SNET_HISTORY_PATH = path.join(runtimeDirectory, "snet-intensity-history.json");
  process.env.CENC_INTENSITY_CACHE_PATH = path.join(runtimeDirectory, "cenc-intensity.json");

  const productionServer = await import("../server.mjs");
  stopProductionServer = productionServer.stopProductionServer;
  return productionServer.serverReady;
}

async function createWindow() {
  const service = await startLocalService();
  const allowedOrigin = new URL(service.url).origin;

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#090e10",
    title: "天气与地震信息看板",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (new URL(targetUrl).origin !== allowedOrigin) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  await mainWindow.loadURL(service.url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow).catch((error) => {
    console.error("应用启动失败", error);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    if (stopProductionServer) void stopProductionServer();
  });
}
