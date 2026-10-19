import type { GroupKey, GroupRating, Tier } from '../../../engine/draft/ratings.ts';

const TONE: Record<Tier, string> = { elite: 'solid-ok', strong: 'ok', average: 'mute', thin: 'bad' };

/** One position group as a chip: "qb elite". The word carries the meaning; the colour is a help. */
export function TierChip({ group, tier, compact = false }: { group: GroupKey; tier: Tier; compact?: boolean }) {
  return (
    <span className={`pill ${TONE[tier]} tc`} title={`${group.toLowerCase()}: ${tier}`}>
      {group.toLowerCase()}{' '}<span className={compact ? 'sr-only' : 'tc-t'}>{tier}</span>
    </span>
  );
}

/** The qb / rb / wr / te chips of a team (flex is in the drawer). */
export function TierChips({ groups }: { groups: readonly GroupRating[] }) {
  return (
    <span className="tc-row">
      {groups.filter((g) => g.key !== 'FLEX').map((g) => <TierChip key={g.key} group={g.key} tier={g.tier} />)}
    </span>
  );
}
