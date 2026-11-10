import { defineConfig } from "prisma/config";
import { existsSync } from "node:fs";

// a local .env is optional: hosts usually set DATABASE_URL in their environment
if (existsSync(".env")) process.loadEnvFile(".env");

// migrations need a direct connection; the app itself may go through a pooler (DATABASE_URL)
const databaseUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("POSTGRES_URL or DATABASE_URL is required");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});
