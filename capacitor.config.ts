import type { CapacitorConfig } from "@capacitor/cli";

const mobileServerUrl = process.env.MOBILE_SERVER_URL?.trim();

if (mobileServerUrl && !mobileServerUrl.startsWith("https://")) {
  throw new Error("MOBILE_SERVER_URL 必须使用 HTTPS");
}

const config: CapacitorConfig = {
  appId: "io.basyacatx.weatherquake",
  appName: "天气与地震信息看板",
  webDir: "dist",
  server: mobileServerUrl
    ? {
        url: mobileServerUrl,
        cleartext: false,
      }
    : {
        androidScheme: "https",
      },
  android: {
    allowMixedContent: false,
  },
};

export default config;
