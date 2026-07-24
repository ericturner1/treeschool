import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "./app/ts-backend/.env" });
config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Drizzle configuration.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/ts-db/src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl
  },
  verbose: true,
  strict: true
});
