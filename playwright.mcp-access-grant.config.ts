import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

dotenv.config({
  path: process.env.MCP_ACCESS_GRANT_ENV_FILE ?? ".env.local",
});

export default defineConfig({
  testDir: "./e2e",
  testMatch: /mcp-access-grant-compatibility\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  timeout: 120_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.MCP_ACCESS_GRANT_BETTERRME_ORIGIN,
    headless: process.env.MCP_ACCESS_GRANT_HEADLESS !== "false",
    trace: "retain-on-failure",
    screenshot: "off",
  },
});
