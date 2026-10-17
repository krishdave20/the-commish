/* The whole transformation, from parsed inputs to serialized output files. No file or network access here, so the
   end-to-end aggregation is testable offline with tiny synthetic CSV strings (pipeline.test.ts). */
import { methodCounts } from '../../src/data/ids.ts';
import {
  MIN_ROUTES, NFLVERSE_ATTRIBUTION, ROUTES_DEFINITION, STAT_DEFINITIONS, nflverseFiles,
  type NflverseManifest, type NflverseSource,
} from '../../src/data/nflverseTypes.ts';
import type { PlayerRecord } from '../../src/data/types.ts';
import type { XtdModel } from '../../src/stats/index.ts';
import { aggregate, applyAliases } from './aggregate.ts';
import { aggregateCoverage } from './coverage.ts';
import { nvPlayers, resolveIds, sleeperCands, unmatchedFile, type Usage } from './join.ts';
import { pfrToGsisFromCsv } from './players.ts';
import type { Ftn, Participation, Play, PlayersCsvRow, SnapRow } from './rows.ts';
import { buildCoverage, buildSeason, buildTeams, buildWeekly } from './tables.ts';

export interface PipelineInputs {
  season: number;
  participationSeason: number;
  generatedAt: string;
  plays: Play[];
  ftn: Map<string, Ftn>;
  snaps: SnapRow[];
  playersCsv: PlayersCsvRow[];
  sleeperPlayers: Record<string, PlayerRecord>;
  xtd: XtdModel | null;
  /** every dropback of the participation season, keyed gameId|playId (the current `plays` when participation is current) */
  partPlays: Map<string, Play>;
  /** a fresh stream of participation rows each call (it is read once for coverage, and once more for man/zone when current) */
  partRows: () => AsyncIterable<Participation>;
  sources: NflverseSource[];
}

export interface PipelineOutputs {
  /** file name -> JSON text, ready to write */
  files: Record<string, string>;
  manifest: NflverseManifest;
  /** pieces the CLI prints */
  summary: { weeklyRows: number; seasonRows: number; teamRows: number; coverageRows: number; entities: number; coverageDropbacks: number; coverageLabeled: number };
}

export async function buildOutputs(inp: PipelineInputs): Promise<PipelineOutputs> {
  const { season, participationSeason, generatedAt } = inp;
  const isCurrent = participationSeason === season;
  const hasModel = inp.xtd !== null;

  // man/zone per play for this season's teams file: only exists when participation is published for this season
  let manZone: Map<string, boolean> | null = null;
  if (isCurrent) {
    manZone = new Map();
    for await (const p of inp.partRows()) if (p.man !== null) manZone.set(`${p.gameId}|${p.playId}`, p.man);
  }

  const agg0 = aggregate({ plays: inp.plays, ftn: inp.ftn, snaps: inp.snaps, pfrToGsis: pfrToGsisFromCsv(inp.playersCsv), xtd: inp.xtd, manZone });
  const cov = await aggregateCoverage(inp.partPlays, inp.partRows());

  const usageOf = (a: typeof agg0) => {
    const usage = new Map<string, Usage>();
    for (const w of a.weeks) {
      const u = usage.get(w.key) ?? { off_snaps: 0, tgt: 0, car: 0 };
      u.off_snaps += w.c.off_snaps; u.tgt += w.c.tgt; u.car += w.c.car;
      usage.set(w.key, u);
    }
    return usage;
  };
  const csv = new Map(inp.playersCsv.map((r) => [r.gsis, r]));
  const extra = [...cov.players].filter(([, p]) => p.total.routes >= MIN_ROUTES).map(([gsis, p]) => ({ gsis, team: p.team }));
  const { players: nv, aliases } = nvPlayers(agg0.entities, usageOf(agg0), csv, extra);
  const agg = applyAliases(agg0, aliases);
  const usage = usageOf(agg);
  const res = resolveIds(nv, sleeperCands(inp.sleeperPlayers));
  const sleeperOf = new Map([...res.byNv].map(([k, m]) => [k, m.sleeperId]));

  const weekly = buildWeekly(agg, { season, generatedAt, sleeperOf, hasModel });
  const seasonFile = buildSeason(agg, { season, generatedAt, sleeperOf, hasModel });
  const teams = buildTeams(agg, { season, generatedAt, hasManZone: manZone !== null });
  const coverage = buildCoverage(cov, { season: participationSeason, generatedAt, isCurrent, routesDefinition: ROUTES_DEFINITION, sleeperOf });
  const unmatched = unmatchedFile(res, nv, usage, { season, generatedAt });

  const files: Record<string, string> = {
    [nflverseFiles.weekly(season)]: JSON.stringify(weekly),
    [nflverseFiles.season(season)]: JSON.stringify(seasonFile),
    [nflverseFiles.teams(season)]: JSON.stringify(teams),
    [nflverseFiles.coverage(participationSeason)]: JSON.stringify(coverage),
    [nflverseFiles.unmatched]: JSON.stringify(unmatched),
  };
  const counts = methodCounts(res);
  const manifest: NflverseManifest = {
    schema: 1,
    generatedAt,
    season,
    seasonsCovered: [season],
    throughWeek: agg.throughWeek,
    participationSeason,
    participationIsCurrent: isCurrent,
    routesDefinition: ROUTES_DEFINITION,
    definitions: STAT_DEFINITIONS,
    sources: inp.sources,
    files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.byteLength(v)])),
    xtd: { available: hasModel, fitSeason: inp.xtd?.fit_season ?? null, version: inp.xtd?.version ?? null },
    matchMethods: counts,
    matched: Object.values(counts).reduce((a, b) => a + b, 0),
    idConflicts: res.conflicts.length,
    unmatchedCount: unmatched.players.length,
    ftnJoinRate: agg.ftnExpected ? Math.round((agg.ftnJoined / agg.ftnExpected) * 1000) / 1000 : null,
    attribution: NFLVERSE_ATTRIBUTION,
  };
  files[nflverseFiles.manifest] = JSON.stringify(manifest);
  return {
    files, manifest,
    summary: {
      weeklyRows: weekly.rows.length, seasonRows: seasonFile.rows.length, teamRows: teams.rows.length, coverageRows: coverage.rows.length,
      entities: nv.length, coverageDropbacks: cov.dropbacks, coverageLabeled: cov.labeled,
    },
  };
}
