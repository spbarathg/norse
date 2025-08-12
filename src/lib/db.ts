import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    try {
      prisma = new PrismaClient({
        log: ['error', 'warn'],
        errorFormat: 'pretty',
      });
      
      // Test the connection
      prisma.$connect().catch((error) => {
        console.error("Failed to connect to database:", error);
      });
    } catch (error) {
      console.error("Failed to create Prisma client:", error);
      throw error;
    }
  }
  return prisma;
} 