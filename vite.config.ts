import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

import { getModelChart, ModelChartError } from "./server/modelChart.mjs";
import { EarthquakeDataError, getEarthquakeSnapshot } from "./server/earthquake.mjs";
import { getJmaTsunamiSnapshot } from "./server/jmaTsunami.mjs";

const ecmwfProxy = {
  target: "https://charts.ecmwf.int/opencharts-api/v1",
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/api\/ecmwf/, ""),
};

const pointForecastProxy = {
  target: "https://api.open-meteo.com",
  changeOrigin: true,
  secure: true,
  rewrite: (requestPath: string) => requestPath.replace(/^\/api\/forecast\/([^/?]+)/, "/v1/$1"),
};

function copyCatalogue() {
  return {
    name: "copy-ecmwf-catalogue",
    apply: "build" as const,
    async closeBundle() {
      const target = path.resolve("dist/data/ecmwf");
      await mkdir(target, { recursive: true });
      await cp(path.resolve("data/ecmwf"), target, { recursive: true });
    },
  };
}

function cleanBuildOutput(): Plugin {
  return {
    name: "clean-build-output-with-retry",
    apply: "build",
    enforce: "pre",
    async buildStart() {
      // The production server can keep serving dist while a local verification
      // build is running. Preserve the previous hashed assets in that mode so
      // already-open dashboards never observe a half-written bundle.
      if (process.env.ECMWF_PBOARD_LIVE_BUILD === "1") return;
      await rm(path.resolve("dist"), {
        recursive: true,
        force: true,
        maxRetries: 12,
        retryDelay: 100,
      });
    },
  };
}

function modelChartApi(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(async (request, response, next) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/api/model-chart") {
        next();
        return;
      }
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "模式图表接口仅支持 GET/HEAD" }));
        return;
      }
      try {
        const result = await getModelChart(requestUrl.searchParams);
        response.writeHead(200, {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=21600, stale-while-revalidate=86400",
          "Content-Length": String(Buffer.byteLength(result.svg)),
          "X-Model-Name": result.model,
          "X-Model-Run": result.run,
          "X-Model-Valid-Time": result.validTime,
          "X-Model-Chart-Cache": result.cache,
        });
        response.end(request.method === "HEAD" ? undefined : result.svg);
      } catch (error) {
        const status = error instanceof ModelChartError ? error.statusCode : 500;
        response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({
          error: "模式图表生成失败",
          detail: error instanceof Error ? error.message : String(error),
        }));
      }
    });
  };
  return {
    name: "model-chart-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

function earthquakeApi(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(async (request, response, next) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/api/earthquakes") {
        next();
        return;
      }
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "地震聚合接口仅支持 GET/HEAD" }));
        return;
      }
      try {
        const result = await getEarthquakeSnapshot(requestUrl.searchParams);
        const body = JSON.stringify(result);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-Earthquake-Cache": String(result.cache),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof EarthquakeDataError ? error.statusCode : 500;
        response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({
          error: "地震速报聚合失败",
          detail: error instanceof Error ? error.message : String(error),
        }));
      }
    });
  };
  return {
    name: "earthquake-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

function jmaTsunamiApi(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(async (request, response, next) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/api/seismic/jma-tsunami") {
        next();
        return;
      }
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "JMA 海啸预报接口仅支持 GET/HEAD" }));
        return;
      }
      try {
        const result = await getJmaTsunamiSnapshot();
        const body = JSON.stringify(result);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({
          error: "JMA 海啸预报获取失败",
          detail: error instanceof Error ? error.message : String(error),
        }));
      }
    });
  };
  return {
    name: "jma-tsunami-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig({
  base: "./",
  plugins: [cleanBuildOutput(), react(), modelChartApi(), earthquakeApi(), jmaTsunamiApi(), copyCatalogue()],
  build: {
    emptyOutDir: false,
    sourcemap: false,
    minify: "terser",
    terserOptions: {
      compress: {
        passes: 2,
        drop_debugger: true,
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false,
      },
    },
  },
  server: {
    proxy: {
      "/api/ecmwf": ecmwfProxy,
      "/api/forecast": pointForecastProxy,
    },
  },
  preview: {
    proxy: {
      "/api/ecmwf": ecmwfProxy,
      "/api/forecast": pointForecastProxy,
    },
  },
});
