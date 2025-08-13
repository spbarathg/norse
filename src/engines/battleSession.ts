import type { BattleOutcome, TurnEvent, Combatant, BattleContext } from "./combat.js";

type Session = {
  id: string;
  ownerUserId: string;
  createdAt: number;
  timeline: TurnEvent[];
  indices: number[];
  pointer: number; // points into indices
  allies: Combatant[];
  enemies: Combatant[];
  ctx: BattleContext;
};

const sessions = new Map<string, Session>();

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createBattleSession(params: {
  ownerUserId: string;
  allies: Combatant[];
  enemies: Combatant[];
  outcome: BattleOutcome;
  ctx: BattleContext;
}): string {
  const { ownerUserId, allies, enemies, outcome, ctx } = params;
  const id = makeId();
  // Choose key frames: first, every 3rd, last
  const indices: number[] = [];
  for (let i = 0; i < outcome.timeline.length; i++) {
    if (i === 0 || i === outcome.timeline.length - 1 || i % 3 === 0) indices.push(i);
  }
  sessions.set(id, {
    id,
    ownerUserId,
    createdAt: Date.now(),
    timeline: outcome.timeline,
    indices,
    pointer: -1, // before first
    allies,
    enemies,
    ctx,
  });
  return id;
}

export function getNextTurnFrame(sessionId: string): { done: boolean; event?: TurnEvent } | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (s.pointer >= s.indices.length - 1) return { done: true };
  s.pointer++;
  const idx = s.indices[s.pointer];
  return { done: false, event: s.timeline[idx] };
}

export function isSessionComplete(sessionId: string): boolean {
  const s = sessions.get(sessionId);
  if (!s) return true;
  return s.pointer >= s.indices.length - 1;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function endBattleSession(sessionId: string) {
  sessions.delete(sessionId);
}


