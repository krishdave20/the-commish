/* Pick order for a draft: snake or linear, optional third-round-style reversal, the slot → roster map, and traded picks. */
import type { TradedPick } from '../../data/contract.ts';

export interface PickSlot {
  /** 1-based overall pick number */
  pickNo: number;
  round: number;
  /** draft slot 1..teams (position in the first round) */
  slot: number;
  /** roster that owns the slot (from slot_to_roster_id; the slot number itself if there is no map) */
  originalRosterId: number;
  /** roster that makes the pick after any traded picks */
  rosterId: number;
}

export interface OrderInput {
  teams: number;
  rounds: number;
  /** 'snake' reverses every other round; 'linear' never does. Anything else (auction) is not supported. */
  type: string;
  /** Sleeper's `reversal_round`: from this round on the snake direction flips (third-round reversal); 0 = none */
  reversalRound?: number;
  /** draft.slot_to_roster_id (slot → roster id) */
  slotToRosterId?: Record<string, number> | null;
  /** draft traded picks: `roster_id` is the original owner of that round's pick, `owner_id` the new owner */
  tradedPicks?: ReadonlyArray<Pick<TradedPick, 'round' | 'roster_id' | 'owner_id'>>;
}

/** True when the given round runs from slot `teams` down to slot 1. */
export function isReversedRound(round: number, type: string, reversalRound = 0): boolean {
  if (type !== 'snake') return false;
  const base = round % 2 === 0;
  return reversalRound > 0 && round >= reversalRound ? !base : base;
}

export function buildDraftOrder(o: OrderInput): PickSlot[] {
  if (o.type !== 'snake' && o.type !== 'linear') throw new Error(`Draft type "${o.type}" is not supported (snake and linear only)`);
  const owner = new Map<string, number>();
  for (const t of o.tradedPicks ?? []) owner.set(`${t.round}:${t.roster_id}`, t.owner_id);
  const out: PickSlot[] = [];
  for (let round = 1; round <= o.rounds; round++) {
    const rev = isReversedRound(round, o.type, o.reversalRound);
    for (let i = 0; i < o.teams; i++) {
      const slot = rev ? o.teams - i : i + 1;
      const original = o.slotToRosterId?.[String(slot)] ?? slot;
      out.push({ pickNo: (round - 1) * o.teams + i + 1, round, slot, originalRosterId: original, rosterId: owner.get(`${round}:${original}`) ?? original });
    }
  }
  return out;
}

/** The order for a Sleeper draft object (+ its traded picks). */
export function draftOrderFor(draft: { type: string; settings: Record<string, number>; slot_to_roster_id?: Record<string, number> | null }, tradedPicks: OrderInput['tradedPicks'] = [], fallbackTeams = 12): PickSlot[] {
  return buildDraftOrder({
    teams: draft.settings.teams ?? fallbackTeams, rounds: draft.settings.rounds ?? 15, type: draft.type,
    reversalRound: draft.settings.reversal_round ?? 0, slotToRosterId: draft.slot_to_roster_id, tradedPicks,
  });
}

/** The draft slot of a user (from draft.draft_order: user id → slot), or null. */
export const slotOfUser = (draft: { draft_order?: Record<string, number> | null }, userId: string): number | null => draft.draft_order?.[userId] ?? null;
