// The Prisma client for plain Node scripts (seeds, data copies), which can't import lib/prisma.ts.
import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { existsSync } from "node:fs";

const { PrismaClient } = pkg;

export function createPrisma(url) {
  // a local .env is optional: hosts usually set DATABASE_URL in their environment
  if (existsSync(".env")) process.loadEnvFile(".env");
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
