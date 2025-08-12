import { getPrisma } from "./db.js";

/**
 * Generate a premium relic ID in the format: <era><character><suffix>
 * Example: E3ZE7H9 (Era 3, Zeus, suffix 7H9)
 */
export async function generateRelicId(eraId: string, characterSlug: string): Promise<string> {
  const prisma = getPrisma();
  
  // Extract era number from eraId (e.g., "first_dawn" -> 1)
  const eraNumber = getEraNumber(eraId);
  const eraPrefix = `E${eraNumber}`;
  
  // Get first two letters of character slug in uppercase
  const characterPrefix = characterSlug.substring(0, 2).toUpperCase();
  
  // Generate unique suffix with retry logic
  let attempts = 0;
  const maxAttempts = 100; // Prevent infinite loops
  
  while (attempts < maxAttempts) {
    const suffix = generateRandomSuffix();
    const relicId = `${eraPrefix}${characterPrefix}${suffix}`;
    
    // Check if this ID already exists
    const existing = await prisma.relic.findUnique({ where: { id: relicId } });
    
    if (!existing) {
      return relicId;
    }
    
    attempts++;
  }
  
  // Fallback: if we can't generate a unique ID, use a timestamp-based approach
  const timestamp = Date.now().toString(36).substring(-3).toUpperCase();
  return `${eraPrefix}${characterPrefix}${timestamp}`;
}

/**
 * Generate a random 3-character alphanumeric suffix (0-9, A-Z)
 */
function generateRandomSuffix(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  
  for (let i = 0; i < 3; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

/**
 * Map era IDs to numbers
 */
function getEraNumber(eraId: string): number {
  const eraMap: Record<string, number> = {
    'first_dawn': 1,
    'golden_age': 2,
    'twilight_war': 3,
    'shadow_reign': 4,
    'new_beginning': 5,
    // Add more eras as needed
  };
  
  return eraMap[eraId] || 1; // Default to era 1 if unknown
}

/**
 * Validate if a string is a valid relic ID format
 */
export function isValidRelicId(id: string): boolean {
  // Format: E[number][2letters][3alphanumeric]
  const pattern = /^E\d+[A-Z]{2}[A-Z0-9]{3}$/;
  return pattern.test(id);
}

/**
 * Parse a relic ID to extract components
 */
export function parseRelicId(id: string): { era: number; character: string; suffix: string } | null {
  if (!isValidRelicId(id)) {
    return null;
  }
  
  const match = id.match(/^E(\d+)([A-Z]{2})([A-Z0-9]{3})$/);
  if (!match) {
    return null;
  }
  
  return {
    era: parseInt(match[1]),
    character: match[2],
    suffix: match[3]
  };
}
