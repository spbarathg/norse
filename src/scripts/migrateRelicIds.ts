import "dotenv/config";
import { getPrisma } from "../lib/db.js";
import { generateRelicId } from "../lib/relicId.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

async function migrateRelicIds() {
  const prisma = getPrisma();
  
  console.log("🔄 Starting relic ID migration...");
  
  try {
    // Load character data
    let characters;
    try {
      characters = require("../../data/allgodschars.json");
    } catch {
      characters = require("../../allgodschars.json");
    }
    
    // Get all relics with old UUID format
    const relics = await prisma.relic.findMany({
      where: {
        id: {
          // Find UUIDs (contains hyphens)
          contains: "-"
        }
      }
    });
    
    console.log(`📦 Found ${relics.length} relics with old UUID format`);
    
    if (relics.length === 0) {
      console.log("✅ No relics need migration!");
      return;
    }
    
    const migrationMap: Array<{ oldId: string; newId: string }> = [];
    
    // Generate new IDs for each relic
    for (const relic of relics) {
      const character = characters.find((c: any) => c.id === relic.characterId);
      if (!character) {
        console.warn(`⚠️ Character not found for relic ${relic.id}`);
        continue;
      }
      
      const newId = await generateRelicId(relic.eraId, character.slug);
      migrationMap.push({ oldId: relic.id, newId });
      
      console.log(`🔄 ${relic.id} → ${newId} (${character.name})`);
    }
    
    // Perform migration in transaction
    await prisma.$transaction(async (tx) => {
      for (const { oldId, newId } of migrationMap) {
        // Create new relic with new ID
        const oldRelic = await tx.relic.findUnique({ where: { id: oldId } });
        if (!oldRelic) continue;
        
        await tx.relic.create({
          data: {
            id: newId,
            characterId: oldRelic.characterId,
            ownerUserId: oldRelic.ownerUserId,
            originUserId: oldRelic.originUserId,
            eraId: oldRelic.eraId,
            rarity: oldRelic.rarity,
            birthIgTs: oldRelic.birthIgTs,
            birthRealTs: oldRelic.birthRealTs,
            durabilityPct: oldRelic.durabilityPct,
            xp: oldRelic.xp,
            evolutionStage: oldRelic.evolutionStage,
            currentStats: oldRelic.currentStats,
            isShadowborn: oldRelic.isShadowborn,
            rebirthIgTs: oldRelic.rebirthIgTs,
            history: oldRelic.history,
            lastDecayTick: oldRelic.lastDecayTick,
            preservationExpiry: oldRelic.preservationExpiry,
            metadata: oldRelic.metadata,
            isLocked: oldRelic.isLocked,
            missionLockId: oldRelic.missionLockId
          }
        });
        
        // Update market listings
        await tx.marketListing.updateMany({
          where: { relicId: oldId },
          data: { relicId: newId }
        });
        
        // Delete old relic
        await tx.relic.delete({ where: { id: oldId } });
      }
    });
    
    console.log(`✅ Successfully migrated ${migrationMap.length} relics!`);
    console.log("\n🎉 All relics now have premium IDs!");
    
    // Show some examples
    console.log("\n📋 Examples of new IDs:");
    const newRelics = await prisma.relic.findMany({ take: 5 });
    newRelics.forEach(relic => {
      console.log(`  ${relic.id} (${relic.rarity} rarity)`);
    });
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url.endsWith(process.argv[1])) {
  migrateRelicIds().catch(console.error);
}

export { migrateRelicIds };
