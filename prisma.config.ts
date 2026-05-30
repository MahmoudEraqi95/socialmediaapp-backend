// prisma.config.ts
// Prisma 7 configuration — datasource URL moved here from schema.prisma

import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrate: {
    migrations: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
