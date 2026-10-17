import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useModel } from '../app/modelContext';
import { useNflverse } from '../app/nflverseData';
import { PAGES } from '../app/names';
import { usePlayersFile } from '../app/playersData';
import { displayName } from '../app/playersIndex';
import { useTitle } from '../app/usePageTitle';
import { PageHeader } from '../components/PageHeader';
import { GameLogCard } from './player/GameLogCard';
import { HeaderCard } from './player/HeaderCard';
import { NflversePanels } from './player/NflversePanels';
import type { PlayerNflverse } from './player/nflversePlayer';
import { byWeek, coverageOf, forPlayer, seasonOf } from './player/nflverseSelect';
import { OutlookCard } from './player/OutlookCard';
import { ValueCard } from './player/ValueCard';

/** One player's scouting report: facts, outlook, game log, trade value and (when the nightly update has run) nflverse usage. */
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
      <p><Link to="/players">← all players</Link></p>
      <HeaderCard pid={pid} name={name} rec={rec} mp={mp} owner={owner} />
      {model && <OutlookCard model={model} mp={mp} />}
      {extras && model && <GameLogCard pid={pid} extras={extras} currentWeek={model.meta.currentWeek} />}
      <ValueCard pid={pid} league={extras?.league ?? null} />
      <NflversePanels pos={pos} data={nvPlayer} loading={nv.loading} />
      <p className="note">Play-by-play and snap data: nflverse. Charting data: FTN Data via nflverse.</p>
    </div>
  );
}
