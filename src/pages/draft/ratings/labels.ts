import type { GroupKey } from '../../../engine/draft/ratings.ts';

/** "qb", "flex": a position group as the page writes it. */
export const groupLabel = (g: GroupKey): string => g.toLowerCase();
