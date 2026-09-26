import { defineConfig } from "prisma/config";
import { existsSync } from "node:fs";

// a local .env is optional: hosts usually set DATABASE_URL in their environment
if (existsSync(".env")) process.loadEnvFile(".env");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});
