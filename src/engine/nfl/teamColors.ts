/* Team colours for the player avatars: a primary and a secondary per team, by Sleeper's abbreviation (LAR, JAX, WAS...).
   Colours are facts about the teams, kept here as hex; they are NOT design tokens (no stylesheet writes them: `Avatar` passes them as custom
   properties). Only colours: no logos, no marks (SPEC section 1). The owner asked for team colours behind the headshots (Oct 18, 2026). */

import { teamOf } from './teams';

export interface TeamColors {
  /** the circle behind the headshot, and the monogram's background */
  primary: string;
  /** the thin ring around the circle */
  secondary: string;
  /** black or white, whichever reads better on `primary` (the monogram letters) */
  text: string;
}

const BLACK = '#000000';
const WHITE = '#ffffff';

function channel(hex: string, i: number): number {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2));
}

/** WCAG contrast ratio of two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever has the higher contrast on `bg`. The better of the two is always at least 4.5 : 1. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, BLACK) ? WHITE : BLACK;
}

const c = (primary: string, secondary: string): TeamColors => ({ primary, secondary, text: readableOn(primary) });

/** The 32 teams, keyed by Sleeper's abbreviation. */
export const TEAM_COLORS: Readonly<Record<string, TeamColors>> = {
  ARI: c('#97233f', '#000000'),
  ATL: c('#a71930', '#000000'),
  BAL: c('#241773', '#9e7c0c'),
  BUF: c('#00338d', '#c60c30'),
  CAR: c('#0085ca', '#101820'),
  CHI: c('#0b162a', '#c83803'),
  CIN: c('#fb4f14', '#000000'),
  CLE: c('#311d00', '#ff3c00'),
  DAL: c('#003594', '#869397'),
  DEN: c('#fb4f14', '#002244'),
  DET: c('#0076b6', '#b0b7bc'),
  GB: c('#203731', '#ffb612'),
  HOU: c('#03202f', '#a71930'),
  IND: c('#002c5f', '#a2aaad'),
  JAX: c('#006778', '#d7a22a'),
  KC: c('#e31837', '#ffb81c'),
  LAC: c('#0080c6', '#ffc20e'),
  LAR: c('#003594', '#ffa300'),
  LV: c('#000000', '#a5acaf'),
  MIA: c('#008e97', '#fc4c02'),
  MIN: c('#4f2683', '#ffc62f'),
  NE: c('#002244', '#c60c30'),
  NO: c('#d3bc8d', '#101820'),
  NYG: c('#0b2265', '#a71930'),
  NYJ: c('#125740', '#000000'),
  PHI: c('#004c54', '#a5acaf'),
  PIT: c('#ffb612', '#101820'),
  SEA: c('#002244', '#69be28'),
  SF: c('#aa0000', '#b3995d'),
  TB: c('#d50a0a', '#ff7900'),
  TEN: c('#0c2340', '#4b92de'),
  WAS: c('#5a1414', '#ffb612'),
};

/** The colours for a team's abbreviation (an old code such as JAC or OAK maps to today's); null for no team or an unknown one (a free agent, a retired player). */
export function teamColors(abbr: string | null | undefined): TeamColors | null {
  const t = teamOf(abbr);
  return t ? TEAM_COLORS[t.abbr] ?? null : null;
}

/** A dark circle or ring would vanish on the dark appearance's paper; `Avatar` adds a faint outer edge to those. */
export function isDeep(colors: TeamColors): boolean {
  return luminance(colors.primary) < 0.06 || luminance(colors.secondary) < 0.06;
}
