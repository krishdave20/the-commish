import type { Phase } from '../data';
import type { Moment, MomentKind } from '../engine/moments';
import { PAGES } from './names';
import type { PageKey } from './names';
import type { NavItem } from './routes';

/* Time-aware navigation (owner request, Oct 18, 2026: "have it reorder the top selections bar"). A pure function over the clock, the phase
   and the moments the engine already worked out. Predictable on purpose: huddle is always first, at most two sections are promoted behind it
   by the first rules that match, every other section keeps its fixed place, and front office stays last. */

export const MAX_PROMOTED = 2;

/** the part of a moment navOrder reads */
export type NavMoment = Pick<Moment, 'kind' | 'title'> & Partial<Pick<Moment, 'countdownTo'>>;

export interface NavOrderInput {
  phase: Phase | null;
  /** epoch ms (the preview clock when one is set) */
  now: number;
  /** NFL games are on right now */
  live: boolean;
  moments: readonly NavMoment[];
  /** the sections in their fixed order */
  sections: readonly NavItem[];
}

export interface NavOrder {
  /** every section, in the order to show */
  order: NavItem[];
  /** why a promoted section is up front: path to a short reason ("waivers process tonight") */
  promoted: Record<string, string>;
}

const TWO_HOURS = 2 * 3_600_000;
const path = (k: PageKey) => PAGES[k].path;

interface Rule { sections: PageKey[]; reason: string }

const find = (moments: readonly NavMoment[], ...kinds: MomentKind[]) => moments.find((m) => kinds.includes(m.kind));

/** The rules in the order they are tried. Each gives up to two sections and a reason; the first two sections found are promoted. */
function rules({ phase, now, live, moments }: NavOrderInput): Rule[] {
  const out: Rule[] = [];
  if (phase === 'pre_draft') out.push({ sections: ['draft', 'players'], reason: find(moments, 'draft-countdown', 'draft-mock', 'draft-tiers', 'draft-queue')?.title ?? 'the draft is coming' });
  if (phase === 'drafting') out.push({ sections: ['draft', 'players'], reason: find(moments, 'draft-clock', 'draft-countdown')?.title ?? 'the draft is on' });
  if (phase === 'offseason') {
    out.push({ sections: ['draft'], reason: find(moments, 'rookie-prep')?.title ?? 'rookie prep' });
    out.push({ sections: ['trades'], reason: find(moments, 'dynasty-movers')?.title ?? 'dynasty values' });
  }
  if (phase === 'postseason') out.push({ sections: ['race', 'gameday'], reason: find(moments, 'playoffs', 'clinched', 'clinch')?.title ?? 'the playoffs' });
  if (phase !== 'in_season' && phase !== null) return out;

  // game time: games are on, or one kicks off within two hours on a game day
  const live1 = find(moments, 'live-matchup');
  const soon = moments.find((m) => (m.kind === 'game-day' || m.kind === 'final-check') && m.countdownTo !== undefined && m.countdownTo - now <= TWO_HOURS && m.countdownTo - now > -TWO_HOURS);
  if (live || live1 || soon) out.push({ sections: ['gameday', 'nfl'], reason: (live1 ?? soon)?.title ?? 'games are on' });
  // monday night, before kickoff
  const monday = find(moments, 'monday-night');
  if (monday) out.push({ sections: ['gameday'], reason: monday.title });
  // the waiver run is a day away, until it clears
  const waivers = find(moments, 'waivers-tonight');
  if (waivers) out.push({ sections: ['waivers', 'team'], reason: waivers.title });
  // tuesday's recap: the week is final, so the standings, power rankings and the week ahead are new (around the league), then the odds
  const recap = find(moments, 'week-recap');
  if (recap) out.push({ sections: ['league', 'race'], reason: recap.title });
  // lineup days: wednesday after the waiver run, through saturday
  const day = new Date(now).getDay();
  if (day >= 3 && day <= 6) {
    out.push({ sections: ['team', 'waivers'], reason: find(moments, 'lineup-swap', 'injury-risk', 'lineup-ok')?.title ?? 'lineup days' });
  }
  const deadline = find(moments, 'trade-deadline');
  if (deadline) out.push({ sections: ['trades'], reason: deadline.title });
  return out;
}

/** The navigation order for this moment. `sections` are in their fixed order; the result is the same sections, reordered. */
export function navOrder(input: NavOrderInput): NavOrder {
  const { sections } = input;
  const home = path('home');
  const last = path('settings');
  const have = new Set(sections.map((s) => s.path));
  const promoted: Record<string, string> = {};
  for (const rule of rules(input)) {
    for (const k of rule.sections) {
      const p = path(k);
      if (Object.keys(promoted).length >= MAX_PROMOTED) break;
      // huddle and front office keep their places; a section the nav does not have, or one already promoted, is skipped
      if (!have.has(p) || p === home || p === last || p in promoted) continue;
      promoted[p] = rule.reason;
    }
    if (Object.keys(promoted).length >= MAX_PROMOTED) break;
  }
  const first = sections.filter((s) => s.path === home);
  const up = Object.keys(promoted).map((p) => sections.find((s) => s.path === p)!);
  const rest = sections.filter((s) => s.path !== home && !(s.path in promoted));
  return { order: [...first, ...up, ...rest], promoted };
}

/** No reordering: the fixed order and nothing promoted (the "smart order: off" setting). */
export function fixedOrder(sections: readonly NavItem[]): NavOrder {
  return { order: [...sections], promoted: {} };
}
