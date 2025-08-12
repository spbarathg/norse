import { PrismaClient } from "@prisma/client";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const eras = require("../src/config/eras.json");

const prisma = new PrismaClient();

async function main() {
  for (const era of eras) {
    await prisma.era.upsert({
      where: { id: era.id },
      update: { name: era.name, startIgTs: era.startIgTs, endIgTs: era.endIgTs, visualId: era.visualId, decayModifier: era.decayModifier, evoCeilingModifier: era.evoCeilingModifier, specialFlags: era.specialFlags },
      create: { id: era.id, name: era.name, startIgTs: era.startIgTs, endIgTs: era.endIgTs, visualId: era.visualId, decayModifier: era.decayModifier, evoCeilingModifier: era.evoCeilingModifier, specialFlags: era.specialFlags },
    });
  }
  console.log("Seeded eras.");
}

main().finally(async () => {
  await prisma.$disconnect();
}); 