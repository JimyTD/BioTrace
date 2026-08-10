const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function loadServerUrl() {
  const fromEnv = process.env.BIOTRACE_SERVER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const file = resolve(__dirname, "server-url.txt");
  if (existsSync(file)) {
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && !s.startsWith("#"));
    if (line) return line.replace(/\/$/, "");
  }
  return "http://127.0.0.1";
}

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: "app.biotrace.mobile",
  appName: "BioTrace",
  webDir: "www",
  server: {
    url: loadServerUrl(),
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#f4f1ea",
    },
  },
};

module.exports = config;
