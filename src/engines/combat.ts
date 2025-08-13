import { createRequire } from "module";

const require = createRequire(import.meta.url);

type Character = {
  id: number;
  name: string;
  slug: string;
  pantheon: string;
  rarity: string;
  class: string;
  element: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  passive_ability_name?: string;
  passive_ability_desc?: string;
  passive?: {
    name: string;
    type: string;
    params: any;
    desc: string;
  };
};

export type Buff = {
  kind: "attack_up" | "defense_up" | "speed_up" | "thorns" | "dodge_up" | "crit_chance_up" | "healing_effectiveness_up" | "taunt" | "invulnerable" | "accuracy_up" | "damage_up" | "heal_over_time" | "all_stats_up";
  valuePct: number; // 0.1 = +10%
  expiresOnTurn?: number; // absolute turn number; undefined = persistent
  stacks?: number; // for stacking buffs
  maxStacks?: number;
  oncePerBattle?: boolean;
  applied?: boolean; // track once per battle
  sourceId?: string; // track which character applied this
};

export type Debuff = {
  kind: "poison" | "bleed" | "sleep" | "stun" | "attack_down" | "defense_down" | "speed_down" | "accuracy_down" | "damage_down" | "no_revive" | "burn" | "freeze" | "all_stats_down";
  valuePct?: number;
  expiresOnTurn?: number;
  stacks?: number;
  permanent?: boolean;
  sourceId?: string; // track which character applied this
};

export type GridPosition = "FL" | "FR" | "BL" | "BR";

export type Combatant = {
  id: string; // relicId for players, generated for enemies
  side: "ally" | "enemy";
  name: string;
  slug: string;
  pantheon?: string;
  rarity: string;
  className?: string;
  element?: string;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  currentHp: number;
  portraitUrl: string | null;
  pos?: GridPosition;
  buffs?: Buff[];
  debuffs?: Debuff[];
  battleState?: {
    revivedOnce?: boolean;
    defeatedEnemies?: number;
    timesAttacked?: number;
    oncePerBattleUsed?: Set<string>;
    damageTaken?: number;
    damageDealt?: number;
    turnsSinceLastAction?: number;
  };
  resistances?: {
    debuffs?: number; // chance to resist debuffs 0-1
    elements?: { [element: string]: number }; // chance to resist element damage
    statusEffects?: { [status: string]: number }; // chance to resist specific statuses
  };
};

export type TurnEvent = {
  turn: number;
  actorId: string;
  actorName: string;
  actorSlug: string;
  targetId: string;
  targetName: string;
  damage: number;
  crit: boolean;
  defeatedTarget: boolean;
  description: string;
  allies: Combatant[];
  enemies: Combatant[];
};

export type BattleOutcome = {
  winner: "ally" | "enemy";
  turns: number;
  mvpName: string;
  mvpSide: "ally" | "enemy";
  timeline: TurnEvent[];
};

function getBaseUrl(): string | null {
  const baseUrl = process.env.CDN_BASE_URL || "http://localhost:3000/cdn";
  return baseUrl || null;
}

function getPortraitUrl(slug: string): string | null {
  const base = getBaseUrl();
  if (!base) return null;
  return `${base}/portraits/${slug}.png`;
}

export function getStageGifUrl(): string | null {
  const base = getBaseUrl();
  if (!base) return null;
  return `${base}/battle/stage.gif`;
}

export function getVsGifUrl(): string | null {
  const base = getBaseUrl();
  if (!base) return null;
  return `${base}/battle/vs_screen.gif`;
}

export function getCritGifUrl(): string | null {
  const base = getBaseUrl();
  if (!base) return null;
  return `${base}/battle/critical_hit.gif`;
}

export function getVictoryGifUrl(): string | null {
  const base = getBaseUrl();
  if (!base) return null;
  return `${base}/battle/victory.gif`;
}

export function buildHpBar(current: number, max: number, width = 10): string {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const filledEmoji = "🟩";
  const emptyEmoji = "⬜";
  return `${filledEmoji.repeat(filled)}${emptyEmoji.repeat(empty)} ${Math.max(0, Math.ceil(ratio * 100))}%`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T>(items: T[], getWeight: (item: T) => number): T {
  const weights = items.map(getWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function cloneCombatant(c: Combatant): Combatant {
  return { 
    ...c, 
    buffs: [...(c.buffs || [])],
    debuffs: [...(c.debuffs || [])],
    battleState: c.battleState ? { 
      ...c.battleState,
      oncePerBattleUsed: new Set(c.battleState.oncePerBattleUsed)
    } : undefined
  };
}

function initializeBattleState(c: Combatant) {
  if (!c.battleState) {
    c.battleState = {
      revivedOnce: false,
      defeatedEnemies: 0,
      timesAttacked: 0,
      oncePerBattleUsed: new Set(),
      damageTaken: 0,
      damageDealt: 0,
      turnsSinceLastAction: 0
    };
  }
  if (!c.resistances) {
    c.resistances = {
      debuffs: 0,
      elements: {},
      statusEffects: {}
    };
  }
}

function selectTarget(targetType: string, self: Combatant, allies: Combatant[], enemies: Combatant[], context?: any): Combatant | null {
  const living = (arr: Combatant[]) => arr.filter(c => c.currentHp > 0);
  const ownTeam = self.side === 'ally' ? allies : enemies;
  const enemyTeam = self.side === 'ally' ? enemies : allies;
  
  switch (targetType) {
    case 'self':
      return self;
    case 'allies':
    case 'all_allies':
      return null; // Will be handled as array
    case 'enemies':
    case 'all_enemies':
      return null; // Will be handled as array
    case 'random_ally':
      const livingAllies = living(ownTeam);
      return livingAllies.length > 0 ? pickRandom(livingAllies) : null;
    case 'random_enemy':
      const livingEnemies = living(enemyTeam);
      return livingEnemies.length > 0 ? pickRandom(livingEnemies) : null;
    case 'fastest_enemy':
      const fastestEnemies = living(enemyTeam)
        .sort((a, b) => effectiveSpeed(b) - effectiveSpeed(a));
      return fastestEnemies[0] || null;
    case 'slowest_enemy':
      const slowestEnemies = living(enemyTeam)
        .sort((a, b) => effectiveSpeed(a) - effectiveSpeed(b));
      return slowestEnemies[0] || null;
    case 'most_injured_ally':
      const injuredAllies = living(ownTeam)
        .filter(c => c.currentHp < c.maxHp)
        .sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp));
      return injuredAllies[0] || null;
    case 'lowest_hp_enemy':
      const lowHpEnemies = living(enemyTeam)
        .sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp));
      return lowHpEnemies[0] || null;
    case 'highest_atk_ally':
      const strongAllies = living(ownTeam)
        .sort((a, b) => b.atk - a.atk);
      return strongAllies[0] || null;
    default:
      return null;
  }
}

function selectTargets(targetType: string, self: Combatant, allies: Combatant[], enemies: Combatant[], context?: any): Combatant[] {
  const living = (arr: Combatant[]) => arr.filter(c => c.currentHp > 0);
  const ownTeam = self.side === 'ally' ? allies : enemies;
  const enemyTeam = self.side === 'ally' ? enemies : allies;
  
  switch (targetType) {
    case 'allies':
    case 'all_allies':
      return living(ownTeam);
    case 'enemies':
    case 'all_enemies':
      return living(enemyTeam);
    case 'all':
      return living([...allies, ...enemies]);
    default:
      const single = selectTarget(targetType, self, allies, enemies, context);
      return single ? [single] : [];
  }
}

export async function selectPlayerTeamFromRelics(userId: string, prisma: any, maxMembers = 3): Promise<Combatant[]> {
  // Heuristic: pick latest 3 relics
  const relics = await prisma.relic.findMany({ where: { ownerUserId: userId }, orderBy: { birthRealTs: "desc" }, take: maxMembers });
  if (relics.length === 0) return [];
  const characters: Character[] = require("../../data/allgodschars.json");
  const team: Combatant[] = relics.map((relic: any, idx: number) => {
    const ch = characters.find(c => c.id === relic.characterId);
    const stats = JSON.parse(relic.currentStats || "{}");
    const name = ch?.name || relic.id;
    const slug = ch?.slug || "odin";
    return {
      id: relic.id,
      side: "ally",
      name,
      slug,
      pantheon: ch?.pantheon,
      rarity: relic.rarity || ch?.rarity || "C",
      className: ch?.class,
      element: ch?.element,
      maxHp: Number(stats.hp || ch?.hp || 100),
      atk: Number(stats.atk || ch?.atk || 10),
      def: Number(stats.def || ch?.def || 10),
      spd: Number(stats.spd || ch?.spd || 10),
      currentHp: Number(stats.hp || ch?.hp || 100),
      portraitUrl: getPortraitUrl(slug),
      pos: (['FL','FR','BL','BR'] as GridPosition[])[idx] || 'FL',
      buffs: [],
      debuffs: [],
    };
  });
  return team;
}

export function selectEnemyTeam(difficulty: number, maxMembers = 3): Combatant[] {
  const characters: Character[] = require("../../data/allgodschars.json");
  // Weight by rarity and slight level scaling by difficulty
  const rarityWeight: Record<string, number> = { S: 1, A: 3, B: 6, C: 10 };
  const pool = characters.filter(c => ["S", "A", "B", "C"].includes(c.rarity));
  const chosen: Character[] = [];
  while (chosen.length < maxMembers) {
    const ch = weightedPick(pool, (c) => rarityWeight[c.rarity]);
    chosen.push(ch);
  }
  return chosen.map((ch, idx) => {
    const scale = 1 + (difficulty - 1) * 0.15; // +15% per difficulty step
    const maxHp = Math.round(ch.hp * scale);
    const atk = Math.round(ch.atk * scale);
    const def = Math.round(ch.def * scale);
    const spd = ch.spd;
    return {
      id: `enemy_${ch.slug}_${idx}_${Math.floor(Math.random() * 10000)}`,
      side: "enemy",
      name: ch.name,
      slug: ch.slug,
      pantheon: ch.pantheon,
      rarity: ch.rarity,
      className: ch.class,
      element: ch.element,
      maxHp,
      atk,
      def,
      spd,
      currentHp: maxHp,
      portraitUrl: getPortraitUrl(ch.slug),
      pos: (['FL','FR','BL','BR'] as GridPosition[])[idx] || 'FL',
      buffs: [],
      debuffs: [],
    };
  });
}

function living(combatants: Combatant[]): Combatant[] {
  return combatants.filter(c => c.currentHp > 0);
}

function isBattleOver(allies: Combatant[], enemies: Combatant[]): boolean {
  return living(allies).length === 0 || living(enemies).length === 0;
}

export type BattleContext = {
  shrine?: { alignment?: string; effigyId?: string };
  gauntlet?: { id?: string; hazards?: any[]; affinities?: any[] };
};

export function simulateBattle(alliesIn: Combatant[], enemiesIn: Combatant[], maxTurns = 18, ctx: BattleContext = {}): BattleOutcome {
  // Work on local copies
  const allies = alliesIn.map(cloneCombatant);
  const enemies = enemiesIn.map(cloneCombatant);
  const timeline: TurnEvent[] = [];
  const damageById: Record<string, number> = {};

  // Initialize battle state for all combatants
  [...allies, ...enemies].forEach(initializeBattleState);

  // Apply OnBattleStart: shrine, structured passives, codex fallback, then hazards
  applyShrineBonuses(allies, ctx.shrine);
  applyStructuredOnBattleStart(allies, enemies);
  applyOnBattleStartCodex(allies, enemies);
  applyGauntletHazards(allies, enemies, ctx.gauntlet);

  // Simple turn order: sort by effective speed each round among living
  let turn = 0;
  while (!isBattleOver(allies, enemies) && turn < maxTurns) {
    turn++;
    const order = [...living(allies), ...living(enemies)].sort((a, b) => effectiveSpeed(b) - effectiveSpeed(a));
    for (const actor of order) {
      if (actor.currentHp <= 0) continue; // actor died earlier in same round
      const opponents = actor.side === "ally" ? living(enemies) : living(allies);
      if (opponents.length === 0) break;
      const target = pickRandom(opponents);

      // Turn-start effects (poison/bleed ticks on actor; sleep/stun skip)
      const skip = handleOnTurnStart(actor, turn, allies, enemies);
      if (skip) {
        timeline.push({
          turn,
          actorId: actor.id,
          actorName: actor.name,
          actorSlug: actor.slug,
          targetId: target.id,
          targetName: target.name,
          damage: 0,
          crit: false,
          defeatedTarget: false,
          description: `${actor.name} cannot act this turn.`,
          allies: allies.map(cloneCombatant),
          enemies: enemies.map(cloneCombatant),
        });
        continue;
      }
      
      // Apply structured OnTurnStart effects
      applyStructuredOnTurnStart(actor, allies, enemies, turn);

      // Pre-attack adjustments (buffs/debuffs)
      const atkMult = 1 + (sumBuffPct(actor, 'attack_up') + sumBuffPct(actor, 'all_stats_up') - sumDebuffPct(actor, 'attack_down') - sumDebuffPct(actor, 'all_stats_down'));
      const defMult = 1 + (sumBuffPct(target, 'defense_up') + sumBuffPct(target, 'all_stats_up') - sumDebuffPct(target, 'defense_down') - sumDebuffPct(target, 'all_stats_down'));
      const effectiveAtk = Math.round(actor.atk * Math.max(0.5, atkMult));
      const effectiveDef = Math.round(target.def * Math.max(0.5, defMult));

      const base = Math.max(1, effectiveAtk - Math.floor(effectiveDef * 0.5));
      const variance = 0.85 + Math.random() * 0.3; // ±15%
      let dmg = Math.max(1, Math.round(base * variance));
      
      // Critical hit calculation
      const targetSleeping = hasDebuff(target, 'sleep');
      const baseCritChance = 0.12;
      const critChanceBonus = sumBuffPct(actor, 'crit_chance_up');
      const totalCritChance = Math.min(0.95, baseCritChance + critChanceBonus);
      let crit = targetSleeping || Math.random() < totalCritChance;
      if (crit) dmg = Math.round(dmg * 1.8);
      
      // Apply structured passive damage modifiers and on-hit effects
      const hitResult = applyStructuredOnHit(actor, target, allies, enemies, dmg);
      dmg += hitResult.extraDamage;

      // Apply structured OnBeingAttacked effects
      dmg = applyStructuredOnBeingAttacked(actor, target, allies, enemies, dmg);
      
      // Apply damage
      target.currentHp = Math.max(0, target.currentHp - dmg);
      actor.battleState!.damageDealt = (actor.battleState!.damageDealt || 0) + dmg;
      target.battleState!.damageTaken = (target.battleState!.damageTaken || 0) + dmg;
      damageById[actor.id] = (damageById[actor.id] || 0) + dmg;

      let defeatedTarget = target.currentHp <= 0;
      let description = `${actor.name} strikes ${target.name} for ${dmg} damage${crit ? " — CRITICAL!" : ""}${defeatedTarget ? " and defeats them!" : "."}`;
      
      // Handle cleave attacks
      if (hitResult.cleaveTargets.length > 0) {
        hitResult.cleaveTargets.forEach(cleaveTarget => {
          const cleaveDmg = Math.round(dmg * 0.3);
          cleaveTarget.currentHp = Math.max(0, cleaveTarget.currentHp - cleaveDmg);
          description += ` Cleave hits ${cleaveTarget.name} for ${cleaveDmg} damage!`;
          if (cleaveTarget.currentHp <= 0) {
            description += ` ${cleaveTarget.name} is defeated!`;
          }
        });
      }
      
      // Check for self-revive if target was defeated
      if (defeatedTarget && attemptSelfRevive(target, allies, enemies)) {
        defeatedTarget = false;
        description += ` But ${target.name} revives!`;
      }

      // Legacy on being attacked triggers
      handleLegacyOnBeingAttacked(actor, target);

      // Legacy status application from passives
      maybeApplyOnAttackStatus(actor, target, turn);

      // Legacy threshold-based triggers
      handleHpThresholdTriggers(actor, target);
      
      // Check health thresholds for reactive triggers
      checkHealthThresholds(target, allies, enemies);

      timeline.push({
        turn,
        actorId: actor.id,
        actorName: actor.name,
        actorSlug: actor.slug,
        targetId: target.id,
        targetName: target.name,
        damage: dmg,
        crit,
        defeatedTarget,
        description,
        allies: allies.map(cloneCombatant),
        enemies: enemies.map(cloneCombatant),
      });

      // Structured on-turn-end effects
      applyStructuredOnTurnEnd(actor, allies, enemies, turn);
      
      // Legacy on-turn-end effects
      handleOnTurnEnd(actor, allies, enemies, turn);

      // Handle defeat triggers
      if (defeatedTarget) {
        // Structured on-enemy-defeat effects
        applyStructuredOnEnemyDefeat(actor, target, allies, enemies);
        
        // Structured on-ally-defeat effects (check for revival)
        const revived = applyStructuredOnAllyDefeat(target, allies, enemies);
        if (revived) {
          defeatedTarget = false;
          description += ` But ${target.name} is saved from death!`;
        }
        
        // Legacy on-ally-defeat triggers
        const team = target.side === 'ally' ? allies : enemies;
        handleLegacyOnAllyDefeat(team, actor);
      }

      if (isBattleOver(allies, enemies)) break;
    }
  }

  // Decide winner
  const winner: "ally" | "enemy" = living(allies).length > 0 ? "ally" : "enemy";
  let mvpId = Object.entries(damageById).sort((a, b) => b[1] - a[1])[0]?.[0] || (living(allies)[0]?.id || living(enemies)[0]?.id);
  const all = [...allies, ...enemies];
  const mvp = all.find(c => c.id === mvpId) || all[0];

  return {
    winner,
    turns: timeline.length,
    mvpName: mvp?.name || "Hero",
    mvpSide: mvp?.side || winner,
    timeline,
  };
}

export function renderTeamList(team: Combatant[]): string {
  return team.map(c => `• ${c.name} (${c.rarity}) — ${c.currentHp}/${c.maxHp}`).join("\n");
}

export function renderHpPanel(allies: Combatant[], enemies: Combatant[]): string {
  const allyLines = allies.map(c => `🛡️ ${c.name}: ${buildHpBar(c.currentHp, c.maxHp)}`).join("\n");
  const enemyLines = enemies.map(c => `⚔️ ${c.name}: ${buildHpBar(c.currentHp, c.maxHp)}`).join("\n");
  return `Allies\n${allyLines}\n\nEnemies\n${enemyLines}`;
}

// ===== Structured Passive Implementation =====

function applyStructuredOnBattleStart(allies: Combatant[], enemies: Combatant[]) {
  const characters: Character[] = require("../../data/allgodschars.json");
  const lookup = new Map<string, Character>();
  characters.forEach(ch => lookup.set(ch.slug, ch));
  
  const all = [...allies, ...enemies];
  
  for (const combatant of all) {
    const character = lookup.get(combatant.slug);
    if (!character?.passive || !['S', 'A'].includes(combatant.rarity)) continue;
    
    const passive = character.passive;
    const params = passive.params || {};
    
    switch (passive.type) {
      case 'Aura':
        handleAuraPassive(combatant, params, allies, enemies);
        break;
      case 'ApplyEffectOnBattleStart':
        handleApplyEffectOnBattleStart(combatant, params, allies, enemies);
        break;
      case 'TeamBuff':
        handleTeamBuff(combatant, params, allies, enemies);
        break;
      case 'SelfBuff':
        handleSelfBuff(combatant, params, allies, enemies);
        break;
      case 'Resistance':
        handleResistance(combatant, params, allies, enemies);
        break;
    }
  }
}

function applyStructuredOnTurnStart(actor: Combatant, allies: Combatant[], enemies: Combatant[], turn: number) {
  const characters: Character[] = require("../../data/allgodschars.json");
  const character = characters.find(ch => ch.slug === actor.slug);
  if (!character?.passive || !['S', 'A'].includes(actor.rarity)) return;
  
  const passive = character.passive;
  const params = passive.params || {};
  
  switch (passive.type) {
    case 'OnTurnStart':
      handleOnTurnStartPassive(actor, params, allies, enemies, turn);
      break;
    case 'Aura':
      if (params.ally_buff?.type === 'HealOverTime') {
        const targets = selectTargets('allies', actor, allies, enemies);
        targets.forEach(target => {
          const healAmount = Math.round(target.maxHp * params.ally_buff.valuePct);
          target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
        });
      }
      break;
  }
}

function applyStructuredOnHit(attacker: Combatant, target: Combatant, allies: Combatant[], enemies: Combatant[], damage: number): { extraDamage: number; cleaveTargets: Combatant[] } {
  const characters: Character[] = require("../../data/allgodschars.json");
  const character = characters.find(ch => ch.slug === attacker.slug);
  if (!character?.passive || !['S', 'A'].includes(attacker.rarity)) {
    return { extraDamage: 0, cleaveTargets: [] };
  }
  
  const passive = character.passive;
  const params = passive.params || {};
  let extraDamage = 0;
  let cleaveTargets: Combatant[] = [];
  
  switch (passive.type) {
    case 'OnHitEffect':
      const result = handleOnHitEffect(attacker, target, params, allies, enemies, damage);
      extraDamage = result.extraDamage;
      cleaveTargets = result.cleaveTargets;
      break;
    case 'DamageModifier':
      if (matchesCondition(target, params.condition || {})) {
        extraDamage = Math.round(damage * params.valuePct);
      }
      break;
  }
  
  return { extraDamage, cleaveTargets };
}

function applyStructuredOnBeingAttacked(attacker: Combatant, target: Combatant, allies: Combatant[], enemies: Combatant[], damage: number): number {
  const characters: Character[] = require("../../data/allgodschars.json");
  const character = characters.find(ch => ch.slug === target.slug);
  if (!character?.passive || !['S', 'A'].includes(target.rarity)) return damage;
  
  const passive = character.passive;
  const params = passive.params || {};
  
  switch (passive.type) {
    case 'OnBeingAttacked':
      return handleOnBeingAttacked(attacker, target, params, allies, enemies, damage);
    case 'Resistance':
      return handleResistanceDamage(attacker, target, params, damage);
  }
  
  return damage;
}

function applyStructuredOnTurnEnd(actor: Combatant, allies: Combatant[], enemies: Combatant[], turn: number) {
  const characters: Character[] = require("../../data/allgodschars.json");
  const character = characters.find(ch => ch.slug === actor.slug);
  if (!character?.passive || !['S', 'A'].includes(actor.rarity)) return;
  
  const passive = character.passive;
  const params = passive.params || {};
  
  switch (passive.type) {
    case 'OnTurnEnd':
      handleOnTurnEndPassive(actor, params, allies, enemies, turn);
      break;
  }
}

function applyStructuredOnEnemyDefeat(victor: Combatant, defeated: Combatant, allies: Combatant[], enemies: Combatant[]) {
  const characters: Character[] = require("../../data/allgodschars.json");
  const character = characters.find(ch => ch.slug === victor.slug);
  if (!character?.passive || !['S', 'A'].includes(victor.rarity)) return;
  
  const passive = character.passive;
  const params = passive.params || {};
  
  switch (passive.type) {
    case 'OnEnemyDefeat':
      handleOnEnemyDefeat(victor, defeated, params, allies, enemies);
      break;
  }
  
  victor.battleState!.defeatedEnemies = (victor.battleState!.defeatedEnemies || 0) + 1;
}

function applyStructuredOnAllyDefeat(defeated: Combatant, allies: Combatant[], enemies: Combatant[]): boolean {
  // Check all living allies for OnAllyDefeat passives
  const characters: Character[] = require("../../data/allgodschars.json");
  let revived = false;
  
  const team = defeated.side === 'ally' ? allies : enemies;
  for (const ally of team) {
    if (ally.currentHp <= 0 || ally.id === defeated.id) continue;
    
    const character = characters.find(ch => ch.slug === ally.slug);
    if (!character?.passive || !['S', 'A'].includes(ally.rarity)) continue;
    
    const passive = character.passive;
    const params = passive.params || {};
    
    if (passive.type === 'OnAllyDefeat') {
      revived = handleOnAllyDefeat(ally, defeated, params, allies, enemies) || revived;
    }
  }
  
  return revived;
}

function attemptSelfRevive(combatant: Combatant, allies: Combatant[], enemies: Combatant[]): boolean {
  if (combatant.battleState?.revivedOnce) return false;
  
  const characters: Character[] = require("../../data/allgodschars.json");
  const character = characters.find(ch => ch.slug === combatant.slug);
  if (!character?.passive || !['S', 'A'].includes(combatant.rarity)) return false;
  
  const passive = character.passive;
  const params = passive.params || {};
  
  if (passive.type === 'SelfRevive') {
    return handleSelfRevive(combatant, params, allies, enemies);
  }
  
  return false;
}

function checkHealthThresholds(combatant: Combatant, allies: Combatant[], enemies: Combatant[]) {
  const characters: Character[] = require("../../data/allgodschars.json");
  
  // Check all living allies for ReactiveTrigger passives
  const team = combatant.side === 'ally' ? allies : enemies;
  for (const ally of team) {
    if (ally.currentHp <= 0) continue;
    
    const character = characters.find(ch => ch.slug === ally.slug);
    if (!character?.passive || !['S', 'A'].includes(ally.rarity)) continue;
    
    const passive = character.passive;
    const params = passive.params || {};
    
    if (passive.type === 'ReactiveTrigger') {
      handleReactiveTrigger(ally, combatant, params, allies, enemies);
    }
  }
  
  // Check self for SelfBuffOnHealthLoss
  const selfCharacter = characters.find(ch => ch.slug === combatant.slug);
  if (selfCharacter?.passive?.type === 'SelfBuffOnHealthLoss' && ['S', 'A'].includes(combatant.rarity)) {
    handleSelfBuffOnHealthLoss(combatant, selfCharacter.passive.params || {}, allies, enemies);
  }
}

// ===== Individual Passive Type Handlers =====

function handleAuraPassive(self: Combatant, params: any, allies: Combatant[], enemies: Combatant[]) {
  if (params.ally_buff) {
    const targets = selectTargets('allies', self, allies, enemies);
    targets.forEach(target => {
      if (!params.ally_buff.condition || matchesCondition(target, params.ally_buff.condition)) {
        if (params.ally_buff.type === 'HealOverTime') {
          // Applied on turn start
          return;
        }
        applyStatBuff(target, params.ally_buff.stat, params.ally_buff.valuePct, self.id);
      }
    });
  }
  
  if (params.enemy_debuff) {
    const targets = selectTargets('enemies', self, allies, enemies);
    targets.forEach(target => {
      if (!params.enemy_debuff.condition || matchesCondition(target, params.enemy_debuff.condition)) {
        applyDebuffToTarget(target, params.enemy_debuff.debuff, params.enemy_debuff.valuePct, params.enemy_debuff.durationTurns, self.id);
      }
    });
  }
}

function handleApplyEffectOnBattleStart(self: Combatant, params: any, allies: Combatant[], enemies: Combatant[]) {
  const targets = selectTargets(params.target || 'allies', self, allies, enemies);
  
  if (params.buff) {
    targets.forEach(target => {
      if (params.buff === 'random') {
        const randomBuffs = ['attack_up', 'defense_up', 'speed_up', 'crit_chance_up'];
        const buffType = pickRandom(randomBuffs);
        applyBuffToTarget(target, buffType, 0.2, 3, self.id);
      } else {
        applyBuffToTarget(target, params.buff.type, params.buff.valuePct, params.buff.durationTurns, self.id);
      }
    });
  }
  
  if (params.debuff) {
    targets.forEach(target => {
      if (params.debuff === 'random') {
        const randomDebuffs = ['attack_down', 'defense_down', 'speed_down', 'accuracy_down'];
        const debuffType = pickRandom(randomDebuffs);
        applyDebuffToTarget(target, debuffType, 0.15, 3, self.id);
      } else {
        applyDebuffToTarget(target, params.debuff.type, params.debuff.valuePct, params.debuff.durationTurns, self.id);
      }
    });
  }
  
  // Handle special targets (Norns)
  if (params.target2 && params.debuff) {
    const secondTargets = selectTargets(params.target2, self, allies, enemies);
    secondTargets.forEach(target => {
      if (params.debuff === 'random') {
        const randomDebuffs = ['attack_down', 'defense_down', 'speed_down', 'accuracy_down'];
        const debuffType = pickRandom(randomDebuffs);
        applyDebuffToTarget(target, debuffType, 0.15, 3, self.id);
      }
    });
  }
}

function handleTeamBuff(self: Combatant, params: any, allies: Combatant[], enemies: Combatant[]) {
  const targets = selectTargets('allies', self, allies, enemies);
  targets.forEach(target => {
    if (!params.condition || matchesCondition(target, params.condition)) {
      applyStatBuff(target, params.stat, params.valuePct, self.id);
    }
  });
}

function handleSelfBuff(self: Combatant, params: any, allies: Combatant[], enemies: Combatant[]) {
  if (params.condition && !matchesConditionAdvanced(self, params.condition, allies, enemies)) {
    return;
  }
  applyStatBuff(self, params.stat, params.valuePct, self.id);
}

function handleResistance(self: Combatant, params: any, allies: Combatant[], enemies: Combatant[]) {
  const targets = params.target === 'team' ? selectTargets('allies', self, allies, enemies) : [self];
  
  targets.forEach(target => {
    if (!target.resistances) target.resistances = { debuffs: 0, elements: {}, statusEffects: {} };
    
    if (params.resist === 'debuff') {
      target.resistances.debuffs = Math.min(1, (target.resistances.debuffs || 0) + params.chancePct);
    } else if (Array.isArray(params.resist)) {
      params.resist.forEach((type: string) => {
        if (['Fire', 'Ice', 'Water', 'Nature', 'Light', 'Dark', 'Wind', 'Lightning', 'Physical'].includes(type)) {
          target.resistances!.elements![type] = Math.min(1, (target.resistances!.elements![type] || 0) + (params.valuePct || params.chancePct));
        } else {
          target.resistances!.statusEffects![type] = Math.min(1, (target.resistances!.statusEffects![type] || 0) + params.chancePct);
        }
      });
    } else {
      if (['Fire', 'Ice', 'Water', 'Nature', 'Light', 'Dark', 'Wind', 'Lightning', 'Physical'].includes(params.resist)) {
        target.resistances.elements![params.resist] = Math.min(1, (target.resistances.elements![params.resist] || 0) + (params.valuePct || params.chancePct));
      } else if (params.resist === 'any') {
        target.resistances.debuffs = Math.min(1, (target.resistances.debuffs || 0) + params.chancePct);
      } else {
        target.resistances.statusEffects![params.resist] = Math.min(1, (target.resistances.statusEffects![params.resist] || 0) + params.chancePct);
      }
    }
  });
}

function handleOnTurnStartPassive(self: Combatant, params: any, allies: Combatant[], enemies: Combatant[], turn: number) {
  if (params.effect === 'ReduceDebuffDuration') {
    const targets = selectTargets('allies', self, allies, enemies);
    targets.forEach(target => {
      if (target.debuffs) {
        target.debuffs.forEach(debuff => {
          if (debuff.expiresOnTurn && debuff.expiresOnTurn > turn) {
            debuff.expiresOnTurn = Math.max(turn, debuff.expiresOnTurn - (params.value || 1));
          }
        });
      }
    });
  } else if (params.effect === 'ApplyBuff') {
    const target = selectTarget(params.target || 'self', self, allies, enemies);
    if (target) {
      applyBuffToTarget(target, params.buff, params.valuePct || 1, params.durationTurns || 1, self.id);
    }
  } else if (params.chancePct && Math.random() < params.chancePct) {
    if (params.effect === 'ApplyDebuff') {
      const target = selectTarget(params.target || 'fastest_enemy', self, allies, enemies);
      if (target) {
        applyDebuffToTarget(target, params.debuff, params.valuePct, params.durationTurns, self.id);
      }
    }
  }
}

function handleOnHitEffect(attacker: Combatant, target: Combatant, params: any, allies: Combatant[], enemies: Combatant[], damage: number): { extraDamage: number; cleaveTargets: Combatant[] } {
  let extraDamage = 0;
  let cleaveTargets: Combatant[] = [];
  
  const chance = params.chancePct || 1.0;
  if (Math.random() > chance) return { extraDamage, cleaveTargets };
  
  if (params.debuff) {
    applyDebuffToTarget(target, params.debuff, params.valuePct, params.durationTurns, attacker.id);
  } else if (params.effect === 'cleave') {
    const enemyTeam = attacker.side === 'ally' ? enemies : allies;
    const livingEnemies = enemyTeam.filter(e => e.currentHp > 0 && e.id !== target.id);
    if (livingEnemies.length > 0) {
      cleaveTargets = [pickRandom(livingEnemies)];
    }
  } else if (params.effect === 'ApplyDebuff') {
    applyDebuffToTarget(target, params.debuff, params.valuePct, params.durationTurns, attacker.id);
  }
  
  return { extraDamage, cleaveTargets };
}

function handleOnBeingAttacked(attacker: Combatant, target: Combatant, params: any, allies: Combatant[], enemies: Combatant[], damage: number): number {
  let finalDamage = damage;
  
  if (params.debuff && Array.isArray(params.debuff)) {
    params.debuff.forEach((debuffType: string) => {
      const debuffValue = params.valuePct || 0.05;
      applyDebuffToTarget(attacker, debuffType, debuffValue, undefined, target.id, true);
    });
  } else if (params.debuff) {
    const chance = params.chancePct || 1.0;
    if (Math.random() < chance) {
      applyDebuffToTarget(attacker, params.debuff, params.valuePct, params.durationTurns, target.id);
    }
  }
  
  target.battleState!.timesAttacked = (target.battleState!.timesAttacked || 0) + 1;
  return finalDamage;
}

function handleResistanceDamage(attacker: Combatant, target: Combatant, params: any, damage: number): number {
  if (params.resist === 'Physical' && attacker.element === 'Physical') {
    if (Math.random() < params.chancePct) {
      return 0; // Dodged
    }
  }
  return damage;
}

function handleOnTurnEndPassive(self: Combatant, params: any, allies: Combatant[], enemies: Combatant[], turn: number) {
  if (params.effect === 'Heal') {
    if (params.target === 'most_injured_ally') {
      const target = selectTarget('most_injured_ally', self, allies, enemies);
      if (target) {
        const healAmount = Math.round(target.maxHp * params.valuePct);
        target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
      }
    } else if (params.target === 'allies') {
      const targets = selectTargets('allies', self, allies, enemies);
      targets.forEach(target => {
        const healAmount = Math.round(target.maxHp * params.valuePct);
        target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
      });
    }
  }
}

function handleOnEnemyDefeat(victor: Combatant, defeated: Combatant, params: any, allies: Combatant[], enemies: Combatant[]) {
  if (params.target === 'self' && params.buff) {
    if (params.stacking && params.max_stacks) {
      const existingBuffs = (victor.buffs || []).filter(b => b.kind === getBuff(params.buff.stat) && b.sourceId === victor.id);
      if (existingBuffs.length < params.max_stacks) {
        applyBuffToTarget(victor, getBuff(params.buff.stat), params.buff.valuePct, 99, victor.id);
      }
    } else {
      applyBuffToTarget(victor, getBuff(params.buff.stat), params.buff.valuePct, 99, victor.id);
    }
  }
}

function handleOnAllyDefeat(ally: Combatant, defeated: Combatant, params: any, allies: Combatant[], enemies: Combatant[]): boolean {
  if (params.effect === 'CheatDeath' && !defeated.battleState?.revivedOnce) {
    const key = `cheat_death_${ally.id}`;
    if (params.once_per_battle && ally.battleState?.oncePerBattleUsed?.has(key)) {
      return false;
    }
    
    defeated.currentHp = Math.round(defeated.maxHp * (params.healToHpPct || 0.01));
    defeated.battleState!.revivedOnce = true;
    
    if (params.applyBuff) {
      applyBuffToTarget(defeated, params.applyBuff.type, params.applyBuff.valuePct || 1, params.applyBuff.durationTurns || 1, ally.id);
    }
    
    if (params.once_per_battle) {
      ally.battleState!.oncePerBattleUsed!.add(key);
    }
    
    return true;
  }
  
  return false;
}

function handleSelfRevive(combatant: Combatant, params: any, allies: Combatant[], enemies: Combatant[]): boolean {
  combatant.currentHp = Math.round(combatant.maxHp * (params.reviveHpPct || 0.25));
  combatant.battleState!.revivedOnce = true;
  
  if (params.buffs && Array.isArray(params.buffs)) {
    params.buffs.forEach((buff: any) => {
      applyBuffToTarget(combatant, buff.type, buff.valuePct, buff.durationTurns, combatant.id);
    });
  }
  
  return true;
}

function handleReactiveTrigger(ally: Combatant, injured: Combatant, params: any, allies: Combatant[], enemies: Combatant[]) {
  if (params.trigger === 'ally_hp_below_25' && (injured.currentHp / injured.maxHp) <= 0.25) {
    const key = `reactive_${ally.id}_${injured.id}`;
    if (params.once_per_battle && ally.battleState?.oncePerBattleUsed?.has(key)) {
      return;
    }
    
    if (params.effect === 'Heal') {
      const healAmount = Math.round(injured.maxHp * params.valuePct);
      injured.currentHp = Math.min(injured.maxHp, injured.currentHp + healAmount);
    }
    
    if (params.once_per_battle) {
      ally.battleState!.oncePerBattleUsed!.add(key);
    }
  }
}

function handleSelfBuffOnHealthLoss(combatant: Combatant, params: any, allies: Combatant[], enemies: Combatant[]) {
  const missingHpPct = 1 - (combatant.currentHp / combatant.maxHp);
  const thresholds = Math.floor(missingHpPct / 0.2); // Every 20%
  
  if (thresholds > 0 && params.stat && params.valuePctPer20PctMissing) {
    const totalBonus = thresholds * params.valuePctPer20PctMissing;
    
    // Remove existing self-applied buffs of this type
    if (combatant.buffs) {
      combatant.buffs = combatant.buffs.filter(b => !(b.sourceId === combatant.id && b.kind === getBuff(params.stat)));
    }
    
    // Apply new buff with current bonus
    applyStatBuff(combatant, params.stat, totalBonus, combatant.id);
  }
}

function applyStatBuff(target: Combatant, stat: string | string[], valuePct: number, sourceId?: string) {
  const stats = Array.isArray(stat) ? stat : [stat];
  
  stats.forEach(s => {
    switch (s) {
      case 'all':
        applyBuffToTarget(target, 'all_stats_up', valuePct, undefined, sourceId);
        break;
      case 'ATK':
        applyBuffToTarget(target, 'attack_up', valuePct, undefined, sourceId);
        break;
      case 'DEF':
        applyBuffToTarget(target, 'defense_up', valuePct, undefined, sourceId);
        break;
      case 'SPD':
        applyBuffToTarget(target, 'speed_up', valuePct, undefined, sourceId);
        break;
      case 'HP':
        const bonus = Math.round(target.maxHp * valuePct);
        target.maxHp += bonus;
        target.currentHp += bonus;
        break;
      case 'crit_chance':
        applyBuffToTarget(target, 'crit_chance_up', valuePct, undefined, sourceId);
        break;
      case 'accuracy':
        applyBuffToTarget(target, 'accuracy_up', valuePct, undefined, sourceId);
        break;
      case 'healing_effectiveness':
        applyBuffToTarget(target, 'healing_effectiveness_up', valuePct, undefined, sourceId);
        break;
    }
  });
}

function getBuff(stat: string): string {
  switch (stat) {
    case 'ATK': return 'attack_up';
    case 'DEF': return 'defense_up';
    case 'SPD': return 'speed_up';
    case 'HP': return 'heal_over_time';
    case 'all': return 'all_stats_up';
    default: return 'attack_up';
  }
}

function applyBuffToTarget(target: Combatant, buffType: string, valuePct: number, duration?: number, sourceId?: string) {
  target.buffs = target.buffs || [];
  target.buffs.push({
    kind: buffType as any,
    valuePct,
    expiresOnTurn: duration,
    sourceId
  });
}

function applyDebuffToTarget(target: Combatant, debuffType: string, valuePct?: number, duration?: number, sourceId?: string, permanent?: boolean) {
  target.debuffs = target.debuffs || [];
  
  // Check resistance
  if (target.resistances) {
    if (target.resistances.debuffs && Math.random() < target.resistances.debuffs) {
      return; // Resisted
    }
    if (target.resistances.statusEffects?.[debuffType] && Math.random() < target.resistances.statusEffects[debuffType]) {
      return; // Resisted
    }
  }
  
  target.debuffs.push({
    kind: debuffType as any,
    valuePct,
    expiresOnTurn: permanent ? undefined : duration,
    permanent,
    sourceId
  });
}

function matchesConditionAdvanced(combatant: Combatant, condition: any, allies: Combatant[], enemies: Combatant[]): boolean {
  if (condition.ally_name_present) {
    const team = combatant.side === 'ally' ? allies : enemies;
    return team.some(c => c.name === condition.ally_name_present && c.currentHp > 0);
  }
  
  if (condition.enemy_class_present) {
    const opponents = combatant.side === 'ally' ? enemies : allies;
    return opponents.some(c => c.className === condition.enemy_class_present && c.currentHp > 0);
  }
  
  return matchesCondition(combatant, condition);
}

// ===== Legacy Passive and Status Implementation (keyword/slug-based) =====

function hasDebuff(c: Combatant, kind: Debuff["kind"]): boolean {
  return (c.debuffs || []).some(d => d.kind === kind && (!d.expiresOnTurn || d.expiresOnTurn > 0));
}

function sumBuffPct(c: Combatant, kind: Buff["kind"]): number {
  return (c.buffs || [])
    .filter(b => b.kind === kind && (!b.expiresOnTurn || b.expiresOnTurn > 0))
    .reduce((s, b) => s + (b.valuePct || 0), 0);
}

function sumDebuffPct(c: Combatant, kind: Debuff["kind"]): number {
  return (c.debuffs || [])
    .filter(d => d.kind === kind && (!d.expiresOnTurn || d.expiresOnTurn > 0))
    .reduce((s, d) => s + (d.valuePct || 0), 0);
}

function applyTeamBuff(team: Combatant[], kind: Buff["kind"], valuePct: number) {
  team.forEach(c => {
    c.buffs = c.buffs || [];
    c.buffs.push({ kind, valuePct });
  });
}

function applyStatBonus(c: Combatant, stat: 'HP'|'ATK'|'DEF'|'SPD'|'ALL', valuePct: number) {
  if (stat === 'HP') {
    const bonus = Math.round(c.maxHp * valuePct);
    c.maxHp += bonus;
    c.currentHp += bonus;
  } else if (stat === 'ATK') {
    applyBuffToTarget(c, 'attack_up', valuePct, undefined, 'legacy');
  } else if (stat === 'DEF') {
    applyBuffToTarget(c, 'defense_up', valuePct, undefined, 'legacy');
  } else if (stat === 'SPD') {
    applyBuffToTarget(c, 'speed_up', valuePct, undefined, 'legacy');
  } else if (stat === 'ALL') {
    applyBuffToTarget(c, 'all_stats_up', valuePct, undefined, 'legacy');
  }
}

function applyShrineBonuses(allies: Combatant[], shrine?: { alignment?: string; effigyId?: string }) {
  if (!shrine) return;
  // Pantheon alignment bonuses
  try {
    const pantheonBonuses = require("../config/pantheon_bonuses.json");
    if (shrine.alignment && pantheonBonuses[shrine.alignment]) {
      const bonuses: any[] = pantheonBonuses[shrine.alignment];
      allies.forEach(c => {
        if (c.pantheon === shrine.alignment) {
          bonuses.forEach(b => applyStatBonus(c, b.stat, Number(b.valuePct || 0)));
        }
      });
    }
  } catch {}
  // Effigy effects
  try {
    if (shrine.effigyId) {
      const effigies: any[] = require("../config/effigies.json");
      const eff = effigies.find(e => e.id === shrine.effigyId);
      if (eff) {
        (eff.effects || []).forEach((fx: any) => {
          if (fx.type === 'TeamBuffIf') {
            allies.forEach(c => {
              if (matchesCondition(c, fx.condition || {})) {
                applyStatBonus(c, fx.stat, Number(fx.valuePct || 0));
              }
            });
          }
        });
      }
    }
  } catch {}
}

// Legacy Codex: parse character ability metadata for OnBattleStart hooks (B/C tier only)
function applyOnBattleStartCodex(allies: Combatant[], enemies: Combatant[]) {
  const characters: Character[] = require("../../data/allgodschars.json");
  const codex = require("../config/ability_codex.json");
  const lookup = new Map<string, Character>();
  characters.forEach(ch => lookup.set(ch.slug, ch));
  const all = [...allies, ...enemies].filter(c => !['S', 'A'].includes(c.rarity)); // Only B/C tier
  for (const c of all) {
    const meta = lookup.get(c.slug);
    if (!meta) continue;
    const passive = `${meta.passive_ability_name || ''} ${meta.passive_ability_desc || ''}`.toLowerCase();
    const rules: any[] = codex["OnBattleStart"] || [];
    for (const rule of rules) {
      if (passive.includes(String(rule.match).toLowerCase())) {
        const eff = rule.effect;
        if (eff.type === 'TeamBuff') {
          const team = (eff.target === 'own_team') ? (c.side === 'ally' ? allies : enemies) : (c.side === 'ally' ? enemies : allies);
          const kind = eff.stat === 'ATK' ? 'attack_up' : eff.stat === 'DEF' ? 'defense_up' : eff.stat === 'SPD' ? 'speed_up' : null;
          if (kind) applyTeamBuff(team, kind as any, Number(eff.valuePct || 0));
        }
        if (eff.type === 'ApplyDebuff') {
          const targets = eff.target === 'opponents' ? (c.side === 'ally' ? enemies : allies) : (c.side === 'ally' ? allies : enemies);
          targets.forEach(t => {
            applyDebuffToTarget(t, eff.debuff, eff.valuePct, Number(eff.durationTurns || 0), c.id);
          });
        }
      }
    }
  }
}

function applyGauntletHazards(allies: Combatant[], enemies: Combatant[], gauntlet?: { id?: string; hazards?: any[]; affinities?: any[] }) {
  if (!gauntlet) return;
  const hazardIds: string[] = (gauntlet as any).hazards || [gauntlet.id!].filter(Boolean);
  if (hazardIds.length === 0) return;
  let hazardConfig: any = {};
  try { hazardConfig = require("../config/hazards.json"); } catch {}

  const applyToSet = (set: Combatant[], effect: any) => {
    set.forEach(c => {
      if (effect.type === 'ApplyDebuff') {
        c.debuffs = c.debuffs || [];
        c.debuffs.push({ kind: effect.debuff, valuePct: effect.valuePct, expiresOnTurn: effect.durationTurns });
      } else if (effect.type === 'ApplyDebuffIf') {
        if (matchesCondition(c, effect.condition || {})) {
          c.debuffs = c.debuffs || [];
          c.debuffs.push({ kind: effect.debuff, valuePct: effect.valuePct, expiresOnTurn: effect.durationTurns });
        }
      } else if (effect.type === 'TeamBuffIf') {
        if (matchesCondition(c, effect.condition || {})) {
          applyStatBonus(c, effect.stat, Number(effect.valuePct || 0));
        }
      }
    });
  };

  hazardIds.forEach(hid => {
    const effects: any[] = hazardConfig[hid] || [];
    effects.forEach(eff => {
      const target = (eff.target || 'all') as string;
      if (target === 'all' || target === 'allies') applyToSet(allies, eff);
      if (target === 'all' || target === 'enemies') applyToSet(enemies, eff);
    });
  });
}

function matchesCondition(c: Combatant, cond: any): boolean {
  if (!cond) return true;
  
  // Class conditions
  if (cond.actor_class && c.className !== cond.actor_class) return false;
  if (cond.actor_class_not && c.className === cond.actor_class_not) return false;
  
  // Element conditions
  if (cond.actor_element && c.element !== cond.actor_element) return false;
  if (cond.actor_element_not && c.element === cond.actor_element_not) return false;
  if (cond.element_is && c.element !== cond.element_is) return false;
  
  // Pantheon conditions
  if (cond.pantheon && c.pantheon !== cond.pantheon) return false;
  if (cond.pantheon_not && c.pantheon === cond.pantheon_not) return false;
  
  // Rarity conditions
  if (cond.rarity_is && c.rarity !== cond.rarity_is) return false;
  
  // Target conditions (used in damage modifiers)
  if (cond.target_class_is && c.className !== cond.target_class_is) return false;
  if (cond.target_rarity_is && c.rarity !== cond.target_rarity_is) return false;
  if (cond.target_pantheon_is && c.pantheon !== cond.target_pantheon_is) return false;
  if (cond.target_element_is && c.element !== cond.target_element_is) return false;
  if (cond.target_hp_below && (c.currentHp / c.maxHp) > cond.target_hp_below) return false;
  
  return true;
}

function effectiveSpeed(c: Combatant): number {
  const up = sumBuffPct(c, 'speed_up') + sumBuffPct(c, 'all_stats_up');
  const down = sumDebuffPct(c, 'speed_down') + sumDebuffPct(c, 'all_stats_down');
  const mult = 1 + up - down;
  return Math.max(1, Math.round(c.spd * Math.max(0.5, mult)));
}

// Structured passive runner used by multiple hooks
function applyStructuredEffects(self: Combatant, effects: any[], allies: Combatant[], enemies: Combatant[], target?: Combatant) {
  if (!effects) return;
  effects.forEach(eff => {
    if (eff.type === 'TeamBuff' || eff.type === 'TeamBuffIf') {
      const set = self.side === 'ally' ? allies : enemies;
      if (set) set.forEach(c => {
        if (eff.type === 'TeamBuffIf' && !matchesCondition(c, eff.condition || {})) return;
        applyStatBonus(c, eff.stat, Number(eff.valuePct || 0));
      });
    }
    if (eff.type === 'ApplyDebuff' || eff.type === 'ApplyDebuffIf') {
      const tgt = target || (self.side === 'ally' ? (enemies[0] || null) : (allies[0] || null));
      if (!tgt) return;
      if (eff.type === 'ApplyDebuffIf' && !matchesCondition(tgt, eff.condition || {})) return;
      tgt.debuffs = tgt.debuffs || [];
      tgt.debuffs.push({ kind: eff.debuff, valuePct: eff.valuePct, expiresOnTurn: eff.durationTurns });
    }
    if (eff.type === 'ExecuteBelowPct' && target) {
      if (target.currentHp > 0 && target.currentHp / target.maxHp <= Number(eff.valuePct || 0)) {
        target.currentHp = 0;
      }
    }
  });
}

function handleOnTurnStart(actor: Combatant, turn: number, allies: Combatant[], enemies: Combatant[]): boolean {
  // Tick damage over time
  let totalDot = 0;
  (actor.debuffs || []).forEach(d => {
    if (d.kind === 'poison' || d.kind === 'bleed' || d.kind === 'burn') {
      const tick = Math.max(1, Math.round(actor.maxHp * 0.04));
      totalDot += tick;
    }
    if (d.expiresOnTurn) d.expiresOnTurn -= 1;
  });
  if (totalDot > 0) {
    actor.currentHp = Math.max(0, actor.currentHp - totalDot);
    actor.battleState!.damageTaken = (actor.battleState!.damageTaken || 0) + totalDot;
  }
  
  // Clean up expired debuffs
  if (actor.debuffs) {
    actor.debuffs = actor.debuffs.filter(d => !d.expiresOnTurn || d.expiresOnTurn > 0);
  }
  
  // Clean up expired buffs
  if (actor.buffs) {
    actor.buffs = actor.buffs.filter(b => !b.expiresOnTurn || b.expiresOnTurn > 0);
  }
  
  // Skip if stunned, sleeping, or frozen
  const incapacitated = (actor.debuffs || []).some(d => 
    (d.kind === 'stun' || d.kind === 'sleep' || d.kind === 'freeze') && 
    (!d.expiresOnTurn || d.expiresOnTurn > 0)
  );
  
  if (incapacitated) {
    return true;
  }
  
  return false;
}

function handleLegacyOnBeingAttacked(attacker: Combatant, target: Combatant) {
  const characters: Character[] = require("../../data/allgodschars.json");
  const codex = require("../config/ability_codex.json");
  const targetMeta = characters.find(c => c.slug === target.slug);
  if (!targetMeta || ['S', 'A'].includes(target.rarity)) return; // Skip S/A tier, they use structured passives
  
  const passive = `${targetMeta?.passive_ability_name || ''} ${targetMeta?.passive_ability_desc || ''}`.toLowerCase();
  const rules: any[] = codex["OnBeingAttacked"] || [];
  for (const rule of rules) {
    if (passive.includes(String(rule.match).toLowerCase())) {
      const eff = rule.effect;
      if (eff.type === 'AttackerPermanentDebuff') {
        attacker.debuffs = attacker.debuffs || [];
        (eff.debuffs || []).forEach((d: any) => attacker.debuffs!.push({ kind: d.kind, valuePct: d.valuePct, sourceId: target.id }));
      }
    }
  }
  // Thorns buff
  const thornsPct = sumBuffPct(target, 'thorns');
  if (thornsPct > 0) {
    const reflect = Math.max(1, Math.round(attacker.maxHp * 0.05 * thornsPct * 10));
    attacker.currentHp = Math.max(0, attacker.currentHp - reflect);
  }
}

function maybeApplyOnAttackStatus(attacker: Combatant, target: Combatant, turn: number) {
  if (['S', 'A'].includes(attacker.rarity)) return; // Skip S/A tier, they use structured passives
  
  const characters: Character[] = require("../../data/allgodschars.json");
  const codex = require("../config/ability_codex.json");
  const attackerMeta = characters.find(c => c.slug === attacker.slug);
  if (!attackerMeta) return;
  
  const passive = `${attackerMeta.passive_ability_name || ''} ${attackerMeta.passive_ability_desc || ''}`.toLowerCase();
  const rules: any[] = codex["OnAttack"] || [];
  for (const rule of rules) {
    if (passive.includes(String(rule.match).toLowerCase())) {
      const eff = rule.effect;
      if (eff.type === 'ApplyDebuffChance') {
        if (Math.random() < Number(eff.chance || 0)) {
          applyDebuffToTarget(target, eff.debuff, eff.valuePct, Number(eff.durationTurns || 0), attacker.id);
        }
      }
    }
  }
}

function handleHpThresholdTriggers(attacker: Combatant, target: Combatant) {
  if (['S', 'A'].includes(attacker.rarity)) return; // Skip S/A tier, they use structured passives
  
  const characters: Character[] = require("../../data/allgodschars.json");
  const codex = require("../config/ability_codex.json");
  const meta = characters.find(c => c.slug === attacker.slug);
  if (!meta) return;
  
  const passive = `${meta.passive_ability_name || ''} ${meta.passive_ability_desc || ''}`.toLowerCase();
  const rules: any[] = codex["Thresholds"] || [];
  for (const rule of rules) {
    if (passive.includes(String(rule.match).toLowerCase())) {
      const eff = rule.effect;
      if (eff.type === 'ExecuteBelowPct') {
        if (target.currentHp > 0 && target.currentHp / target.maxHp <= Number(eff.valuePct || 0)) {
          target.currentHp = 0;
        }
      }
    }
  }
}

function handleOnTurnEnd(actor: Combatant, allies: Combatant[], enemies: Combatant[], turn: number) {
  if (['S', 'A'].includes(actor.rarity)) return; // Skip S/A tier, they use structured passives
  
  const characters: Character[] = require("../../data/allgodschars.json");
  const codex = require("../config/ability_codex.json");
  const meta = characters.find(c => c.slug === actor.slug);
  if (!meta) return;
  
  const passive = `${meta.passive_ability_name || ''} ${meta.passive_ability_desc || ''}`.toLowerCase();
  const rules: any[] = codex["OnTurnEnd"] || [];
  for (const rule of rules) {
    if (passive.includes(String(rule.match).toLowerCase())) {
      const eff = rule.effect;
      if (eff.type === 'TeamHeal') {
        const team = actor.side === 'ally' ? allies : enemies;
        team.forEach(a => a.currentHp = Math.min(a.maxHp, a.currentHp + Math.max(1, Math.round(a.maxHp * Number(eff.valuePct || 0)))));
      }
      if (eff.type === 'HealMostInjured') {
        const team = actor.side === 'ally' ? allies : enemies;
        const injured = team.filter(a => a.currentHp > 0 && a.currentHp < a.maxHp);
        if (injured.length > 0) {
          const target = injured.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp))[0];
          target.currentHp = Math.min(target.maxHp, target.currentHp + Math.max(1, Math.round(target.maxHp * Number(eff.valuePct || 0))));
        }
      }
    }
  }
}

function handleLegacyOnAllyDefeat(team: Combatant[], opponent: Combatant) {
  // Legacy codex-based OnAllyDefeat rules for B/C tier characters
  const characters: Character[] = require("../../data/allgodschars.json");
  const codex = require("../config/ability_codex.json");
  
  team.filter(c => c.currentHp > 0 && !['S', 'A'].includes(c.rarity)).forEach(ally => {
    const meta = characters.find(ch => ch.slug === ally.slug);
    if (!meta) return;
    
    const passive = `${meta.passive_ability_name || ''} ${meta.passive_ability_desc || ''}`.toLowerCase();
    const rules: any[] = codex["OnAllyDefeat"] || [];
    
    for (const rule of rules) {
      if (passive.includes(String(rule.match).toLowerCase())) {
        const eff = rule.effect;
        if (eff.type === 'SelfBuff') {
          applyBuffToTarget(ally, getBuff(eff.stat), eff.valuePct, eff.durationTurns, ally.id);
        }
      }
    }
  });
}


