import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export const E2E_DB_PATH = path.resolve(__dirname, "e2e.db");
export const E2E_USERNAME = "e2e-adam";
export const E2E_PASSWORD = "e2e-test-pass-456";
// base64 of the bcrypt hash of E2E_PASSWORD — see actions/auth.ts for why
// this is base64-encoded rather than raw (Next's env loader mangles the
// `$`-heavy raw hash regardless of how the env var is set).
export const E2E_PASSWORD_HASH_BASE64 =
  "JDJiJDEyJHVoakZRS0psZHFPaHo0SmVDbjZERXVmaTg2MG5ZcDJST3AvTkR2aWxkWHo2SnRkcXBYenhH";

const PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 390, height: 844 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      TURSO_DATABASE_URL: `file:${E2E_DB_PATH}`,
      TURSO_AUTH_TOKEN: "e2e-unused",
      ADMIN_USERNAME: E2E_USERNAME,
      ADMIN_PASSWORD_HASH_BASE64: E2E_PASSWORD_HASH_BASE64,
      SESSION_SECRET: "e2e-session-secret-not-for-production-use-only",
    },
  },
});
