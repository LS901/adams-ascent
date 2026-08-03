import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    env: {
      TURSO_DATABASE_URL: ":memory:",
      TURSO_AUTH_TOKEN: "test-unused",
      ADMIN_USERNAME: "testadmin",
      // base64 of the bcrypt hash of "test-password-123" — see
      // actions/auth.ts for why this is base64-encoded rather than raw.
      ADMIN_PASSWORD_HASH_BASE64:
        "JDJiJDEyJFBDL0FYem1RdjYyVVFBa29ZVmNZSy5ETWxkYXA0TGVlR1ZJV1U5aWFPZWNUOWd2c1ZWLmND",
      SESSION_SECRET: "test-session-secret-not-for-production-use-only",
    },
    coverage: {
      provider: "v8",
      include: ["lib/**", "actions/**"],
      exclude: ["lib/db/seed.ts"],
    },
  },
});
