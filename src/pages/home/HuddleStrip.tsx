import { Link } from 'react-router-dom';
import { formatOdds, formatPoints1, ordinal } from '../../app/format';
import { useModel, useScenario } from '../../app/modelContext';
import { FEATURE, PAGES } from '../../app/names';
import { teamResult } from '../../app/results';
import { ClinchMark } from '../../components/ClinchMark';
import { CountUp } from '../../components/CountUp';
import { HeadlineStrip } from '../../components/HeadlineStrip';
import type { HeadlineItem } from '../../components/HeadlineStrip';
import { TierPill } from '../../components/TierPill';
import type { Engine } from '../../engine';
import type { StandingRow } from '../standings';
import { useMatchup } from './useMatchup';
import { firstGameLine, useYourPath } from './yourPath';
import type { YourPath } from './yourPath';

const pct = (x: number) => (x > 0 && x < 0.01 ? '<1%' : formatOdds(x));

function pathItem(y: YourPath | null): HeadlineItem {
  if (!y) return { label: 'your path', value: <span>…</span>, sub: 'simming the season…' };
  const { res, toiletSide, path, lc, mode } = y;
  if (toiletSide) {
    const crowned = mode === 'toilet' ? res.flush : res.consolation;
    return {
      label: lc.name,
      value: <span>{pct(crowned)}</span>,
      sub: mode === 'toilet' ? `to be crowned ${lc.champ}: ${lc.line}` : `to be ${lc.champ}`,
    };
  }
  return {
    label: path?.seed ? 'projected seed' : FEATURE.yourPath,
    value: <span>{path?.seed ? ordinal(path.seed) : '—'}{path?.bye && <span className="note"> bye</span>}</span>,
    sub: `${pct(res.title)} title odds · ${formatOdds(res.finals)} to reach the final`,
  };
}

interface Props {
  mine: StandingRow;
  teams: number;
  engine: Engine;
  /** postseason: the brackets are the page, so the path is not repeated */
  showPath: boolean;
}

/** In season: record, playoff odds, this week's matchup and your path, as one slim row. The answer to "how am I doing". */
export function HuddleStrip({ mine, teams, engine, showPath }: Props) {
  const { model } = useModel();
  const { live } = useScenario();
  const y = useYourPath(engine);
  const m = useMatchup(engine);
  const res = model ? teamResult(model, live, engine.meRid) : null;
  const des = engine.designations()[engine.meRid];
  const pending = !!model?.oddsPending && !live;

  const items: HeadlineItem[] = [
    {
      label: 'record',
      value: <span><CountUp value={mine.wins} />–<CountUp value={mine.losses} />{mine.ties > 0 && <>–<CountUp value={mine.ties} /></>}</span>,
      sub: `${mine.teamName}, ${ordinal(mine.rank)} of ${teams}`,
    },
    {
      label: FEATURE.odds,
      value: pending || !res ? <span>…</span> : <span><CountUp value={Math.round(res.playoff * 100)} />%<ClinchMark mark={des?.mark} /></span>,
      sub: pending || !res
        ? 'simming the season…'
        : <><TierPill p={res.playoff} pending={false} status={des?.clinch ? 'clinched' : des?.elim ? 'eliminated' : undefined} />{' '}{formatPoints1(res.expW)} expected wins</>,
    },
    m ? {
      label: FEATURE.matchup,
      value: <span><CountUp value={Math.round(m.p * 100)} />%<span className="note"> {m.p >= 0.5 ? 'favorite' : 'underdog'}</span></span>,
      sub: m.live
        ? `week ${m.week}, live: ${formatPoints1(m.live.mine)} to ${formatPoints1(m.live.theirs)} vs ${m.opp.team}`
        : `week ${m.week}: ${formatPoints1(m.mine)} to ${formatPoints1(m.theirs)} vs ${m.opp.team}`,
    } : { label: FEATURE.matchup, value: <span>—</span>, sub: 'no matchup this week' },
    ...(showPath ? [pathItem(y)] : []),
  ];
  const line = showPath && y ? firstGameLine(y.path, y.names, y.toiletSide && y.mode === 'toilet') : null;
  const lead = showPath && y?.toiletSide
    ? (y.mode === 'toilet'
      ? `the odds have you in the toilet bowl (${formatOdds(y.res.inField)}) before the playoffs (${formatOdds(y.res.playoff)}). someone has to be the worst team in the league.`
      : `the odds have you in the consolation bracket (${formatOdds(y.res.inField)}) before the playoffs (${formatOdds(y.res.playoff)}). there is still a trophy down here.`)
    : null;
  return (
    <>
      <HeadlineStrip label="your season" items={items} />
      <p className="note strip-note">
        {lead && <>{lead}{' '}</>}
        {line && <>{line}{' '}</>}
        <Link className="inline-link" to={PAGES.race.path}>open the {PAGES.race.name} →</Link>
      </p>
    </>
  );
}

/** Offseason, pre-draft and draft day: last season's record, when there is one. */
export function SeasonStrip({ mine, teams }: { mine: StandingRow; teams: number }) {
  return (
    <HeadlineStrip label="your last season" items={[
      { label: 'record', value: <span>{mine.wins}–{mine.losses}{mine.ties > 0 && `–${mine.ties}`}</span>, sub: `${mine.teamName}, ${ordinal(mine.rank)} of ${teams}` },
      { label: 'points-for rank', value: <span>#{mine.pfRank}</span>, sub: `of ${teams} teams` },
      { label: 'points for', value: <span>{formatPoints1(mine.pf)}</span>, sub: `${formatPoints1(mine.pa)} against` },
    ]} />
  );
}

