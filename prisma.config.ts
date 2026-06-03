import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Tells Prisma where to find your schema file
  schema: "prisma/schema.prisma",
  
  // Explicitly passes your database URL to Prisma's migration engine
  datasource: {
    url: env("DATABASE_URL"),
  },
});