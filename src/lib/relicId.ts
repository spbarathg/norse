import { getPrisma } from "./db.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const eras = require("../config/eras.json");

function generateRandomSuffix(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function generateRelicId(eraId: string, characterSlug: string): Promise<string> {
  const era = eras.find((e: any) => e.id === eraId);
  if (!era) throw new Error("Era not found");

  const eraNumber = eras.indexOf(era) + 1;
  const charCode = characterSlug.substring(0, 2).toUpperCase();

  let newId: string;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10; // Prevent infinite loops

  const prisma = getPrisma();

  while (!isUnique && attempts < maxAttempts) {
    const suffix = generateRandomSuffix(3);
    newId = `E${eraNumber}${charCode}${suffix}`;
    const existingRelic = await prisma.relic.findUnique({ where: { id: newId } });
    if (!existingRelic) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error("Failed to generate a unique relic ID after multiple attempts.");
  }
  return newId!;
}

export function isValidRelicId(id: string): boolean {
  const regex = /^E\d{1,2}[A-Z]{2}[0-9A-Z]{3}$/;
  return regex.test(id);
}