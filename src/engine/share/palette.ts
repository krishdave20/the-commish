/* The card palette: the same values as the tokens in src/styles/tokens.css, written out as hex because a card is a standalone image and has no
   stylesheet. share.test.ts reads tokens.css and fails if these drift. */
import type { CardTheme } from './types.ts';

export interface Palette {
  paper: string;
  sheet: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  rule2: string;
  green: string;
  greenSoft: string;
  red: string;
  redSoft: string;
  gold: string;
  goldInk: string;
  goldSoft: string;
  /** the turf field */
  turf: string;
  turf2: string;
  turfLine: string;
  turfNum: string;
  turfOn: string;
  turfEdge: string;
  turfEzRed: string;
  turfBall: string;
  turfBallLine: string;
  /** the left end zone and other surfaces that stay dark */
  inverse: string;
  onInverse: string;
  toilet: string;
  toiletEdge: string;
  /** text on a solid accent */
  onAccent: string;
}

export const LIGHT: Palette = {
  paper: '#f4f1eb', sheet: '#faf8f3', ink: '#1f1d19', ink2: '#5d5850', ink3: '#6f6a60', rule: '#dcd5c6', rule2: '#e9e4d8',
  green: '#2d5a27', greenSoft: '#dfe7d9', red: '#8b3a1a', redSoft: '#f1e0d6', gold: '#c4922a', goldInk: '#8a6418', goldSoft: '#f3e8cf',
  turf: '#2d5a27', turf2: '#285022', turfLine: 'rgba(255,255,255,0.7)', turfNum: 'rgba(255,255,255,0.88)', turfOn: 'rgba(255,255,255,0.92)',
  turfEdge: '#1f3f1b', turfEzRed: '#8b3a1a', turfBall: '#8b4719', turfBallLine: '#4c270e',
  inverse: '#1f1d19', onInverse: '#f4f1eb', toilet: '#b9806a', toiletEdge: '#d3b3a6', onAccent: '#f4f1eb',
};

export const DARK: Palette = {
  paper: '#171512', sheet: '#2a2622', ink: '#ece6d9', ink2: '#b7b0a1', ink3: '#9a9487', rule: '#3d3830', rule2: '#26221e',
  green: '#82b878', greenSoft: '#233220', red: '#e8906f', redSoft: '#3b2318', gold: '#d9a63e', goldInk: '#e2b863', goldSoft: '#372c16',
  turf: '#2d5a27', turf2: '#285022', turfLine: 'rgba(255,255,255,0.7)', turfNum: 'rgba(255,255,255,0.88)', turfOn: 'rgba(255,255,255,0.92)',
  turfEdge: '#1f3f1b', turfEzRed: '#8b3a1a', turfBall: '#8b4719', turfBallLine: '#4c270e',
  inverse: '#35312b', onInverse: '#f1ebde', toilet: '#cf9b85', toiletEdge: '#7a5a4c', onAccent: '#171512',
};

export const paletteFor = (theme: CardTheme): Palette => (theme === 'dark' ? DARK : LIGHT);
