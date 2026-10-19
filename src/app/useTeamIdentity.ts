import { useActive } from './hooks';
import { useModel } from './modelContext';

/** The team's name, and one muted line under it: league, week and record. Shared by the wide header and the phone's large title. */
export function useTeamIdentity(): { name: string; context: string } {
  const { model } = useModel();
  const { data: active } = useActive();
  const me = model?.teams.find((t) => t.rid === model.meRid) ?? model?.teams.find((t) => t.isMe) ?? null;
  const name = me?.team ?? active?.account.displayName ?? 'the commish';
  const context = model && me
    ? [model.meta.leagueName, `week ${model.meta.currentWeek}`, `you’re ${me.wins}–${me.losses}${me.ties ? `–${me.ties}` : ''}`].join(' · ')
    : model ? [model.meta.leagueName, `week ${model.meta.currentWeek}`].join(' · ') : '';
  return { name, context };
}
