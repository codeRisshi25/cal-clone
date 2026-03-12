import { PrismaClient } from "@cal-clone/db";

// Singleton Prisma client — reuse across the process
// In tests, each test file resets data via truncate, not by creating new clients
const prisma: PrismaClient = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
});

export default prisma;
