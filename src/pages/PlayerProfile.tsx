import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useModel } from '../app/modelContext';
import { useNflverse } from '../app/nflverseData';
import { PAGES } from '../app/names';
import { usePlayersFile } from '../app/playersData';
import { displayName } from '../app/playersIndex';
import { useTitle } from '../app/usePageTitle';
import { PageHeader } from '../components/PageHeader';
import { PageTabs } from '../components/PageTabs';
import { GameLogCard } from './player/GameLogCard';
import { HeaderCard, WatchButton } from './player/HeaderCard';
import { NflversePanels } from './player/NflversePanels';
import type { PlayerNflverse } from './player/nflversePlayer';
import { byWeek, coverageOf, forPlayer, seasonOf } from './player/nflverseSelect';
import { OutlookCard } from './player/OutlookCard';
import { PlayerStrip } from './player/PlayerStrip';
import { PlayerTakes } from './player/TakesCard';
import { ValueCard } from './player/ValueCard';

const TABS = [
  { value: 'overview', label: 'overview' },
  { value: 'log', label: 'game log' },
  { value: 'usage', label: 'usage' },
  { value: 'splits', label: 'splits' },
  { value: 'value', label: 'value' },
] as const;

/** One player's scouting report: three figures on top, then one tab at a time (overview, game log, usage, splits, value). */
export default function PlayerProfile() {
  const { pid = '' } = useParams();
  const file = usePlayersFile();
  const { model, extras } = useModel();
  const rec = file.data?.[pid];
  const mp = useMemo(() => model?.players.find((p) => p.pid === pid), [model, pid]);
  const name = rec ? displayName({ ...rec, player_id: pid }) : (mp?.name ?? (file.loading ? 'player' : 'unknown player'));
  const pos = rec?.position ?? mp?.pos ?? '';
  const team = rec ? (rec.team ?? 'fa') : (mp?.nfl ?? 'fa');
  useTitle(name.toLowerCase());

  const nv = useNflverse();
  const refreshAll = async () => { await Promise.all([file.refresh(), nv.refresh()]); };
  const nvPlayer = useMemo<PlayerNflverse | null>(() => {
    const b = nv.bundle;
    if (!b) return null;
    return {
      manifest: b.manifest,
      weeks: byWeek(forPlayer(b.weekly, pid)),
      season: seasonOf(b.season, pid),
      coverage: b.coverage ? {
        row: coverageOf(b.coverage.rows, pid), shells: b.coverage.shells[pid] ?? null, season: b.coverage.season,
        isCurrent: b.coverage.isCurrent, routesDefinition: b.coverage.routesDefinition,
      } : null,
    };
  }, [nv.bundle, pid]);

  const owner = useMemo(() => {
    if (!model || !mp) return model ? 'free agent' : null;
    if (mp.ownerRid === 0) return 'free agent';
    return mp.ownerRid === model.meRid ? 'my team' : (model.teams.find((t) => t.rid === mp.ownerRid)?.team ?? null);
  }, [model, mp]);

  return (
    <div className="page page-fade">
      <PageHeader kicker={`${PAGES.players.name} · ${pos || '—'} · ${team}`} title={name} data={{ ...file, refresh: refreshAll }} />
      <div className="row between">
        <Link to="/players">← all players</Link>
        <WatchButton pid={pid} />
      </div>
      {model && mp && <PlayerStrip model={model} mp={mp} league={extras?.league ?? null} />}
      <PageTabs tabs={TABS} label="Player sections">
        {(tab) => tab === 'overview' ? (
          <>
            <HeaderCard pid={pid} rec={rec} mp={mp} owner={owner} />
            <PlayerTakes pid={pid} />
            {model && <OutlookCard model={model} mp={mp} />}
          </>
        ) : tab === 'log' ? (
          extras && model ? <GameLogCard pid={pid} extras={extras} currentWeek={model.meta.currentWeek} /> : <p className="note" role="status">the game log needs your league’s model, which is still loading.</p>
        ) : tab === 'usage' ? <NflversePanels part="usage" pos={pos} data={nvPlayer} loading={nv.loading} />
        : tab === 'splits' ? <NflversePanels part="splits" pos={pos} data={nvPlayer} loading={nv.loading} />
        : <ValueCard pid={pid} league={extras?.league ?? null} />}
      </PageTabs>
      <p className="note">Play-by-play and snap data: nflverse. Charting data: FTN Data via nflverse.</p>
    </div>
  );
}
