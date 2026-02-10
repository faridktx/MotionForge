import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.VITE_BASE_PATH || "/";
const packageVersion = process.env.npm_package_version || "0.0.0";
const commitHash = (process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);
const buildDate = new Date().toISOString();

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`${packageVersion}-${commitHash}`),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
});
