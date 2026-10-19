import type { FinderKind } from '../../../engine/tradefinder/index.ts';

/** Names of the two trade-block tabs this folder and ./history add. */
export const FINDER_TAB = 'trade finder';
export const HISTORY_TAB = 'trade history';

export const KIND_LABEL: Record<FinderKind, string> = { 'two-for-one': '2-for-1', 'one-for-two': '1-for-2', 'three-team': '3-team' };
