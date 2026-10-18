import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../app/dataContext';
import { useLive } from '../../app/live/liveContext';
import { useModel } from '../../app/modelContext';
import { usePlayersFile } from '../../app/playersData';
import { makeScorer } from '../../engine';
import { rowsFromMatchups } from '../../engine/live';
import type { LiveRow } from '../../engine/live';
import { DEFAULT_POSITIONS, gameDetail, indexByTeam } from '../../engine/nfl';
import type { Candidate, GameDetail, NfGame } from '../../engine/nfl';
import type { StatLine, WeekStats } from '../../data';

export interface GameDetailState {
  /** null until there is a league (the model) to join to */
  detail: GameDetail | null;
  loading: boolean;
  /** the players file could not be read: only rostered players show */
  fileError: string | undefined;
}

interface Keyed<T> { key: string; data: T }

/** The fantasy mix for one game. Points come from the league's matchups when a player is rostered, else from the week's stat lines scored with
    the league's settings; projections from the live engine (this week) or Sleeper's projections (a later week); owners from that week's matchups. */
export function useGameDetail(game: NfGame, week: number, currentWeek: number, statLines: WeekStats | null): GameDetailState {
  const { sleeper } = useData();
  const { model, extras } = useModel();
  const live = useLive();
  const file = usePlayersFile();
  const snap = week === currentWeek && !live.replay ? live.snapshot : null;
  const season = model?.meta.season ?? '';
  const leagueId = model?.meta.leagueId ?? '';
  const scoring = extras?.scoring;
  const positions = model?.meta.positions;
  const key = `${leagueId}|${season}|${week}`;

  const [rows, setRows] = useState<Keyed<LiveRow[]> | null>(null);
  const [proj, setProj] = useState<Keyed<Record<string, number>> | null>(null);

  // owners and league points: the poller's rows this week, that week's matchups otherwise
  useEffect(() => {
    if (snap || !sleeper || !leagueId || typeof sleeper.matchups !== 'function') return;
    let alive = true;
    void sleeper.matchups(leagueId, week).then((r) => { if (alive) setRows({ key, data: rowsFromMatchups(r.data) }); }, () => { if (alive) setRows({ key, data: [] }); });
    return () => { alive = false; };
  }, [snap, sleeper, leagueId, week, key]);

  // a later week has no live engine projection: score Sleeper's projection rows with the league's settings
  useEffect(() => {
    if (week <= currentWeek || !sleeper || !season || !scoring || !positions || typeof sleeper.projections !== 'function') return;
    let alive = true;
    const score = makeScorer(scoring);
    void sleeper.projections(season, week, positions).then(
      (r) => { if (alive) setProj({ key, data: Object.fromEntries(r.data.map((p) => [p.player_id, Math.max(0, score(p.stats))])) }); },
      () => { if (alive) setProj({ key, data: {} }); },
    );
    return () => { alive = false; };
  }, [sleeper, season, week, currentWeek, scoring, positions, key]);

  const byTeam = useMemo(() => indexByTeam(file.data, positions ?? DEFAULT_POSITIONS), [file.data, positions]);
  const ownerRows = snap ? snap.rows : rows && rows.key === key ? rows.data : null;
  const mu = snap && live.ctx ? live.ctx.mu : proj && proj.key === key ? proj.data : null;

  const detail = useMemo<GameDetail | null>(() => {
    if (!model || !ownerRows) return null;
    const owners = new Map<string, number>();
    const leaguePoints: Record<string, number> = {};
    for (const r of ownerRows) {
      for (const pid of r.players) owners.set(pid, r.rid);
      Object.assign(leaguePoints, r.playersPoints);
    }
    const rostered: Candidate[] = model.players.filter((p) => p.ownerRid > 0 && p.nfl).map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.nfl!, injury: p.injury || null }));
    const score = makeScorer(scoring ?? {});
    return gameDetail({
      home: game.home, away: game.away, state: game.state, byTeam, rostered, owners,
      teams: Object.fromEntries(model.teams.map((t) => [t.rid, { name: t.team, manager: t.manager }])),
      meRid: model.meRid, leaguePoints, stats: (statLines ?? null) as Record<string, StatLine> | null, score, mu: mu ?? {},
    });
  }, [model, ownerRows, game.home, game.away, game.state, byTeam, scoring, statLines, mu]);

  return { detail, loading: !!model && !ownerRows, fileError: file.error };
}
