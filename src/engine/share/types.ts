/* Types for share cards: plain data in, an SVG string out. Nothing here touches the DOM, so every card is testable in a unit test.
   A card is 1080 x 1350 (4:5 portrait, which iMessage shows large) and is drawn on the page's own palette, light or dark. */

export type CardTheme = 'light' | 'dark';

export const CARD_W = 1080;
export const CARD_H = 1350;

/** A player shown on a card. The headshot is only drawn when `images` holds a CORS-safe copy for his pid; otherwise a team-colour monogram. */
export interface CardPlayer {
  pid: string;
  name: string;
  pos?: string;
  /** the NFL team's abbreviation (its colours sit behind the headshot) */
  team?: string | null;
}

export interface Performer extends CardPlayer { points: number }

export interface MatchupSide {
  name: string;
  score: number;
  isMe: boolean;
  /** "projected 118.4 · 2 left", or "" */
  sub: string;
  /** the biggest scorers, best first */
  performers: Performer[];
}

export interface MatchupCardData {
  kind: 'matchup';
  week: number;
  /** the chip at the top right: "live", "final", "kickoff sun 1:00 pm" */
  statusLabel: string;
  state: 'live' | 'final' | 'pre';
  a: MatchupSide;
  b: MatchupSide;
  /** a's chance to win, 0 to 1 */
  winA: number;
  /** a's chance before kickoff, 0 to 1 */
  preWinA: number;
  /** nothing scored yet: the big numbers are projections */
  projected: boolean;
  /** the sentence under the masthead ("icemen leads killa k im gay by 12.4") */
  headline: string;
  /** "7 starters left" or "" */
  footnote?: string;
}

export interface TakeCardData {
  kind: 'take';
  headline: string;
  statLine: string;
  tone: 'good' | 'bad' | 'watch';
  /** "good news" | "risk" | "watch" */
  toneLabel: string;
  /** "usage spike" */
  kindLabel: string;
  week: number;
  player: CardPlayer;
  /** "how this kind of take did last season", lowercase, or null */
  trackRecord: string | null;
  /** "last season (2025)" etc. */
  dataLabel: string | null;
}

export type BracketCardKind = 'championship' | 'toilet' | 'consolation';

export interface BracketCardSlot {
  rid: number | null;
  name: string;
  seed: number | null;
  bye: boolean;
  /** this team moves on from the game */
  advances: boolean;
  isMe: boolean;
}

export interface BracketCardMatch {
  id: string;
  round: number;
  /** vertical middle, in the layout's own units (see bracketLayout) */
  cy: number;
  a: BracketCardSlot;
  b: BracketCardSlot;
  locked: boolean;
  /** the game this one feeds and which of its slots it fills; null for the final */
  feeds: { to: string; slot: 'a' | 'b' } | null;
}

export interface BracketCardData {
  kind: 'bracket';
  bracketKind: BracketCardKind;
  /** "road to the ’ship" */
  title: string;
  /** "league champ" | "toilet bowl champ" | "consolation champ" */
  champLabel: string;
  /** "crowned the worst team in the league" */
  champLine: string;
  rounds: number;
  /** one label per round ("quarterfinals", "semifinals", "final") */
  roundLabels: string[];
  matches: BracketCardMatch[];
  /** the layout height in layout units */
  layoutHeight: number;
  /** the champion's name, null while undecided */
  champion: string | null;
  championIsMe: boolean;
  /** the owner's picks so far (0 = the bracket as it stands) */
  picks: number;
  weekLabel: string;
}

export interface GradeCardData {
  kind: 'grade';
  team: string;
  isMe: boolean;
  /** "B+", "A−" */
  draftDay: string;
  hindsight: string;
  rank: number;
  teamCount: number;
  /** positive = the draft aged well */
  rankChange: number;
  best: GradePick | null;
  miss: GradePick | null;
  season: string;
}

export interface GradePick extends CardPlayer {
  /** "wr · pick 14" */
  line: string;
  /** "+38 pts vs expected" */
  delta: string;
}

export interface HuddleCardData {
  kind: 'huddle';
  /** "icemen leads killa k im gay 102.0 to 69.2." */
  sentence: string;
  /** "you win 82 of every 100 simulations from here", or null */
  odds: string | null;
  /** the signed-in team's win chance 0 to 1 when the live layer knows it (draws the turf strip) */
  winMe: number | null;
  meName: string | null;
  oppName: string | null;
  /** top starters on each side */
  mine: CardPlayer[];
  theirs: CardPlayer[];
  /** "week 7" or "" */
  weekLabel: string;
}

export type CardSpec = MatchupCardData | TakeCardData | BracketCardData | GradeCardData | HuddleCardData;
export type CardKind = CardSpec['kind'];

/** pid -> a data: URL of a headshot that was fetched with CORS (so it cannot taint the canvas). A pid with no entry gets a monogram. */
export type ImageMap = Readonly<Record<string, string>>;

export interface FontSpec {
  family: 'serif' | 'sans';
  size: number;
  weight?: number;
  italic?: boolean;
  /** letter spacing in px */
  spacing?: number;
}

/** The width of a string in px. The browser passes a canvas measurer with the real fonts; the default is an estimate. */
export type Measure = (text: string, font: FontSpec) => number;

export interface BuildOptions {
  theme: CardTheme;
  images?: ImageMap;
  /** `@font-face` rules (data: URLs) to put inside the SVG so the rasteriser has Instrument Serif */
  fontCss?: string;
  measure?: Measure;
}
