import { useMemo } from 'react';
import { useModel, useScenario } from '../../app/modelContext';
import { formatOdds } from '../../app/format';
import { LOSERS_COPY } from '../../app/names';
import { teamResult } from '../../app/results';
import { bracketsFor, orderFor } from '../../components/bracket/assemble';
import { weeksLabel } from '../../components/bracket/copy';
import { pathOf } from '../../components/bracket/path';
import type { PathInfo } from '../../components/bracket/path';
import { useBracketInputs, useLosersSetting, useSleeperBrackets } from '../../components/bracket/useBracketData';
import type { Engine } from '../../engine';

export interface YourPath {
  res: ReturnType<typeof teamResult>;
  /** more likely to miss the playoffs than make them: the road runs through the non-playoff bracket */
  toiletSide: boolean;
  path: PathInfo | null;
  names: ReadonlyMap<number, string>;
  mode: 'toilet' | 'consolation';
  lc: (typeof LOSERS_COPY)[keyof typeof LOSERS_COPY];
}

/** Where the signed-in team is headed, projected: the playoff road (seed, first opponent, title odds); a team more likely to miss the
    playoffs than make them gets its road through the non-playoff bracket instead. Null until the season simulation has landed. */
export function useYourPath(engine: Engine): YourPath | null {
  const { model } = useModel();
  const { live } = useScenario();
  const inputs = useBracketInputs(engine);
  const { mode } = useLosersSetting();
  const { losers } = useSleeperBrackets();
  const me = engine.meRid;

  return useMemo(() => {
    if (!model || model.oddsPending) return null;
    const make = (seeding: 'projected' | 'today') => {
      const order = orderFor(seeding, { model, sim: live, picks: {}, means: inputs.ctx.means });
      return bracketsFor(order, inputs.rules, mode, losers);
    };
    const res = teamResult(model, live, me);
    const toiletSide = res.inField > res.playoff;
    let b = make('projected');
    // the projection can seat us on the other side of the cut from the odds; fall back to today's table before giving up
    const here = (x: typeof b) => (toiletSide ? x.field : x.title);
    if (!here(b)?.seeds[me]) b = make('today');
    const bk = here(b);
    const path = bk && bk.seeds[me] ? pathOf(bk, inputs.ctx, me) : null;
    return { res, toiletSide, path, names: inputs.names, mode, lc: LOSERS_COPY[mode] };
  }, [model, live, inputs, mode, losers, me]);
}

const name = (names: ReadonlyMap<number, string>, rid: number) => names.get(rid) ?? `team ${rid}`;

/** The one-line "first game" sentence under the strip. */
export function firstGameLine(path: PathInfo | null, names: ReadonlyMap<number, string>, toilet: boolean): string | null {
  if (!path) return null;
  const opp = path.opponent;
  const when = `round ${path.round}, ${weeksLabel(path.weeks)}`;
  const verb = toilet ? 'to lose it and advance' : 'to win';
  if (!opp) return `first game: ${when}, opponent still open.`;
  const seed = opp.seed ? ` (seed ${opp.seed})` : '';
  if (opp.chance >= 0.995) return `first game: ${when} against ${name(names, opp.rid)}${seed}; ${formatOdds(path.advance ?? 0)} ${verb}.`;
  return `first game: ${when}, most likely against ${name(names, opp.rid)}${seed}, ${formatOdds(opp.chance)} to get there; ${formatOdds(path.advance ?? 0)} ${verb}.`;
}

