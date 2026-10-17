/* What the draft room's tabs share: the pick order for a mode, who is who, and the strings only this page uses. */
import type { LeagueBundle, SleeperDraft, SleeperLeague, TradedPick } from '../../data';
import { buildDraftOrder, inferDraftMode, slotOfUser } from '../../engine';
import type { DraftInputs, DraftMode, PickSlot, Rankings } from '../../engine';
import { buildStandings } from '../standings';

export const DRAFT_TEXT = {
  rankings: 'rankings',
  replay: 'replay',
  fantasycalc: 'values: fantasycalc',
} as const;

export type TabKey = 'rankings' | 'mock' | 'clock';

export interface TeamInfo { rosterId: number; team: string; manager: string; mine: boolean }

/** Roster id → team name, manager and whether it is mine. */
export function teamDirectory(bundle: LeagueBundle, userId: string | null): Map<number, TeamInfo> {
  const out = new Map<number, TeamInfo>();
  for (const r of buildStandings(bundle, userId)) out.set(r.rosterId, { rosterId: r.rosterId, team: r.teamName, manager: r.manager, mine: r.isMine });
  return out;
}

export const teamLabel = (teams: ReadonlyMap<number, TeamInfo>, rosterId: number): string => teams.get(rosterId)?.team ?? `team ${rosterId}`;

/** The mode a Sleeper draft is for. */
export const draftModeOf = (league: SleeperLeague, draft: SleeperDraft | null): DraftMode => inferDraftMode(league, draft);

export interface OrderPlan {
  order: PickSlot[];
  teams: number;
  rounds: number;
  type: 'snake' | 'linear';
  /** the order is the league's real draft order (not a made-up one for exploring a different mode) */
  real: boolean;
  /** a plain-English caveat, or null */
  note: string | null;
}

/** Pick order for a draft in `mode`. The league's real draft supplies it when the modes agree (type, rounds, slots, traded
    picks); otherwise it is a snake of the league's size with a typical number of rounds. */
export function planOrder(league: SleeperLeague, draft: SleeperDraft | null, tradedPicks: readonly TradedPick[], mode: DraftMode): OrderPlan {
  const teams = draft?.settings?.teams ?? league.total_rosters;
  const real = !!draft && draftModeOf(league, draft) === mode;
  const fallbackRounds = Math.max(1, league.roster_positions.length);
  const rounds = real
    ? (draft.settings.rounds ?? fallbackRounds)
    : mode === 'rookie' ? ((league.settings.draft_rounds as number | undefined) ?? 4) : fallbackRounds;
  const type: 'snake' | 'linear' = draft?.type === 'linear' ? 'linear' : 'snake';
  let note: string | null = null;
  if (draft && draft.type !== 'snake' && draft.type !== 'linear' && real) note = `${draft.type} drafts are not supported, so this uses a snake order.`;
  else if (!real) note = `your league’s draft is not a ${mode} draft, so this is a ${type} of ${teams} teams and ${rounds} rounds.`;
  const sameTeams = draft?.settings?.teams === undefined || draft.settings.teams === teams;
  const order = buildDraftOrder({
    teams, rounds, type,
    reversalRound: real ? (draft.settings.reversal_round ?? 0) : 0,
    slotToRosterId: real && sameTeams ? draft.slot_to_roster_id : null,
    tradedPicks: real ? tradedPicks : [],
  });
  return { order, teams, rounds, type, real, note };
}

/** The draft slot that is mine (its real slot, else the slot of my roster), or null. */
export function mySlotOf(draft: SleeperDraft | null, userId: string | null, plan: OrderPlan, myRosterId: number | null): number | null {
  const slot = draft && userId ? slotOfUser(draft, userId) : null;
  if (slot !== null && plan.real) return slot;
  if (myRosterId !== null) return plan.order.find((o) => o.originalRosterId === myRosterId)?.slot ?? null;
  return slot;
}

/** My roster id: the roster at my draft slot, else the roster I own. */
export function myRosterOf(bundle: LeagueBundle, draft: SleeperDraft | null, userId: string | null, order: readonly PickSlot[]): number | null {
  if (!userId) return null;
  const slot = draft ? slotOfUser(draft, userId) : null;
  const bySlot = slot !== null ? order.find((o) => o.slot === slot)?.originalRosterId : undefined;
  if (bySlot !== undefined) return bySlot;
  return bundle.rosters.find((r) => r.owner_id === userId || !!r.co_owners?.includes(userId))?.roster_id ?? null;
}

/** Everything a tab needs about the league and the loaded rankings. */
export interface DraftRoom {
  bundle: LeagueBundle;
  league: SleeperLeague;
  /** the league's own draft (null when it has none) */
  draft: SleeperDraft | null;
  /** the mode the draft itself is for */
  draftMode: DraftMode;
  inputs: DraftInputs;
  rankings: Rankings;
  /** the mode being shown (rankings.mode) */
  mode: DraftMode;
  teams: ReadonlyMap<number, TeamInfo>;
  userId: string | null;
  myRosterId: number | null;
  /** FantasyCalc values are in use */
  fcUsed: boolean;
  setMode: (m: DraftMode) => void;
}

export const ordinalPick = (round: number, slot: number) => `${round}.${String(slot).padStart(2, '0')}`;
