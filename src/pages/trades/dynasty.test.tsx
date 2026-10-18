import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LoadModel } from '../../app/loadModel';
import { renderApp } from '../../app/testUtils';
import type { FantasyCalcRow, LeagueBundle, PlayersMap } from '../../data';
import { fcPickRows } from '../../engine/dynasty/test-helpers';
import {
  FAKE_AS_OF, createFakeApi, createFakeSleeper, sampleAccount, sampleBundle, sampleLeague, sampleLoadModel, samplePlayersFile, sampleModel,
} from '../../test/fakes';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const linked = [sampleAccount()];

/* ---------- a dynasty version of the sample league ---------- */

const dynastyLeague = { ...sampleLeague, settings: { ...sampleLeague.settings, type: 2, draft_rounds: 2 } };

type Kind = 'contender' | 'rebuilder';

/** Team 1 (you) is the best team on every axis, or the worst now with a thin roster. */
function lensModel(kind: Kind) {
  const m = sampleModel();
  const odds = kind === 'contender' ? [0.95, 0.5, 0.3, 0.1] : [0.05, 0.95, 0.6, 0.3];
  m.teams.forEach((t, i) => { t.playoffPct = odds[i]!; t.expWins = [4, 3, 2, 1][i]!; });
  if (kind === 'rebuilder') for (const w of Object.keys(m.teams[0]!.exp)) m.teams[0]!.exp[Number(w)] = 1;
  // the receiver is a big upgrade for this season whichever lens you are
  const wr = m.players.find((p) => p.pid === 't2wr')!;
  for (const w of Object.keys(wr.mu)) wr.mu[Number(w)] = 30;
  return m;
}

const loadDynasty = (kind: Kind = 'contender'): LoadModel => async (ctx) => {
  const base = await sampleLoadModel(() => lensModel(kind))(ctx);
  return { ...base, extras: { ...base.extras!, league: dynastyLeague } };
};

const row = (id: string, name: string, position: string, value: number): FantasyCalcRow => ({
  player: { id: 1, name, sleeperId: id, position }, value, overallRank: 1, positionRank: 1, trend30Day: 0,
});

const VALUES: Record<Kind, Record<string, number>> = {
  contender: { t1qb: 9000, t1rb: 8000, t1wr: 7000, t1bw: 5000, t2qb: 3000, t2rb: 2000, t2wr: 4500, t3qb: 2000, t3rb: 1500, t3wr: 1000, t4qb: 900, t4rb: 800, t4wr: 700 },
  rebuilder: { t1qb: 500, t1rb: 500, t1wr: 500, t1bw: 5000, t2qb: 12000, t2rb: 9000, t2wr: 4500, t3qb: 8000, t3rb: 7000, t3wr: 6000, t4qb: 7500, t4rb: 6500, t4wr: 5500 },
};

function fcRows(kind: Kind = 'contender'): FantasyCalcRow[] {
  return [
    ...Object.entries(VALUES[kind]).map(([id, v]) => row(id, id, id.slice(2).toUpperCase().replace('BW', 'WR'), v)),
    ...Object.values(fcPickRows()).map((e) => row(e.sleeperId, e.name, 'PICK', e.value)),
  ];
}

/** Ages: Backup Wideout (the player you send) is 22, Reed Receiver (the one you get) is 31, everyone else 26. */
function playersFile(): PlayersMap {
  const f = samplePlayersFile() as unknown as Record<string, Record<string, unknown>>;
  f.t1bw!.birth_date = '2004-01-01';
  f.t2wr!.birth_date = '1995-01-01';
  return f as unknown as PlayersMap;
}

function setup(kind: Kind = 'contender', o: { traded?: boolean; fcFails?: boolean; route?: string } = {}) {
  const sleeper = createFakeSleeper({ fantasyCalcRows: fcRows(kind), fantasyCalcFails: o.fcFails });
  sleeper.players.mockImplementation(async () => ({ data: playersFile(), asOf: FAKE_AS_OF, fromCache: false, stale: false, bytes: 1, ms: 1, status: 200 }));
  const bundle: LeagueBundle = {
    ...sampleBundle(dynastyLeague),
    tradedPicks: o.traded ? [{ season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }] : [],
  };
  const api = createFakeApi({ bundles: { L1: bundle } });
  return renderApp({ linked, route: o.route ?? '/trades', sleeper, api, loadModel: loadDynasty(kind) });
}

const kpi = (label: string) => screen.getByText(label).closest('.kpi') as HTMLElement;

describe('dynasty mode in a dynasty league', () => {
  it('shows contender or rebuilder: a chart and a labelled table of every team, with your own read', async () => {
    setup('contender', { route: '/trades?tab=dynasty' });
    expect(await screen.findByRole('heading', { level: 2, name: 'contender or rebuilder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'dynasty mode: explore' })).not.toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Contender or rebuilder, every team' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 4);
    const mine = within(table).getByText('Sunday Scaries').closest('tr')!;
    expect(mine).toHaveClass('me');
    expect(within(mine).getByText('contender')).toBeInTheDocument();
    expect(within(mine).getByText('95%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Win-now strength against future strength for 4 teams; you are a contender/ })).toBeInTheDocument();
    expect(screen.getByText(/^you read as a contender: playoff odds 95% \(1st of 4\)/)).toBeInTheDocument();
    expect(document.querySelectorAll('.lens-dot')).toHaveLength(4);
    expect(document.querySelectorAll('.lens-dot[data-me="true"]')).toHaveLength(1);
    expect(screen.getAllByText(/values: fantasycalc\./).length).toBeGreaterThan(0);
    // the table's default columns; the rest wait behind "more columns"
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''))).toEqual(['team', 'label', 'playoff odds', 'dynasty value']);
  });

  it('labels a weak, thin team a rebuilder', async () => {
    setup('rebuilder', { route: '/trades?tab=dynasty' });
    expect(await screen.findByText(/^you read as a rebuilder: playoff odds 5% \(4th of 4\)/)).toBeInTheDocument();
  });

  it('lists every team\'s future picks, with acquired ones and their via owners', async () => {
    setup('contender', { traded: true, route: '/trades?tab=dynasty' });
    const table = await screen.findByRole('table', { name: 'Future picks by team' });
    const mine = within(table).getByText('Sunday Scaries').closest('tr')!;
    // 3 drafts x 2 rounds, plus the 2027 1st bought from Reed Between the Lines (roster 2, whose manager is m2)
    expect(within(mine).getAllByRole('listitem')).toHaveLength(7);
    expect(within(mine).getByText('via m2')).toBeInTheDocument();
    const theirs = within(table).getByText('Reed Between the Lines').closest('tr')!;
    expect(within(theirs).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: 'traded only (1)' })).toBeInTheDocument();
  });

  it('prices the pick and adds it to the analyzer lists as "2027 1st (via m2) · slot · value"', async () => {
    setup('contender', { traded: true });
    const box = await screen.findByRole('checkbox', { name: 'you send: picks: 2027 1st (via m2)' });
    expect(box.closest('label')).toHaveTextContent(/pick 2027 1st \(via m2\) · (early|mid|late)\d/);
    expect(screen.getByRole('checkbox', { name: 'you send: picks: 2028 2nd' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'you get from Fourth and Long: picks: 2029 1st' })).toBeInTheDocument();
  });

  it('adding a pick to the deal changes the net value', async () => {
    const { user } = setup('contender');
    await user.selectOptions(await screen.findByLabelText('trade partner'), 'Reed Between the Lines');
    await user.click(screen.getByRole('checkbox', { name: 'you send: Backup Wideout' }));
    await user.click(screen.getByRole('checkbox', { name: 'you get from Reed Between the Lines: Reed Receiver' }));
    await waitFor(() => expect(within(kpi('net dynasty value')).getByText('−500')).toBeInTheDocument());
    expect(within(kpi('value you send')).getByText('5,000')).toBeInTheDocument();
    expect(within(kpi('value you get')).getByText('4,500')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'you send: picks: 2027 1st' }));
    await waitFor(() => expect(within(kpi('net dynasty value')).getByText('−2,800')).toBeInTheDocument()); // my 2027 1st is a late pick: 2,300
    expect(within(kpi('value you send')).getByText('7,300')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'you get from Reed Between the Lines: picks: 2027 1st' }));
    await waitFor(() => expect(within(kpi('value you get')).getByText('7,500')).toBeInTheDocument()); // their 2027 1st is a mid pick: 3,000
    expect(within(kpi('net dynasty value')).getByText('+200')).toBeInTheDocument();
  });

  it('a deal of picks alone scores value and leaves the lineup untouched', async () => {
    const { user } = setup('contender');
    await user.click(await screen.findByRole('checkbox', { name: 'you send: picks: 2028 1st' }));
    expect(await screen.findByText('your lineup, wks 6–8')).toBeInTheDocument();
    expect(screen.getByText('Close to neutral for your lineup.')).toBeInTheDocument();
    expect(within(kpi('value you send')).getByText('2,000')).toBeInTheDocument();
    expect(within(kpi('net dynasty value')).getByText('−2,000')).toBeInTheDocument();
  });

  it('the verdict is for a contender: the same win-now deal is a take', async () => {
    const { user } = setup('contender');
    await user.selectOptions(await screen.findByLabelText('trade partner'), 'Reed Between the Lines');
    await user.click(screen.getByRole('checkbox', { name: 'you send: Backup Wideout' }));
    await user.click(screen.getByRole('checkbox', { name: 'you send: picks: 2027 1st' }));
    await user.click(screen.getByRole('checkbox', { name: 'you get from Reed Between the Lines: Reed Receiver' }));
    const verdict = await screen.findByTestId('dynasty-verdict');
    expect(verdict.textContent).toMatch(/^take it: as a contender, the lineup gain is what a contender is paying for\./);
    expect(verdict.textContent).toContain('dynasty value 7,300 out, 4,500 in, net −2,800');
    expect(within(kpi('verdict')).getByText('take it')).toBeInTheDocument();
  });

  it('the verdict is for a rebuilder: the same deal is a pass', async () => {
    const { user } = setup('rebuilder');
    await user.selectOptions(await screen.findByLabelText('trade partner'), 'Reed Between the Lines');
    await user.click(screen.getByRole('checkbox', { name: 'you send: Backup Wideout' }));
    await user.click(screen.getByRole('checkbox', { name: 'you send: picks: 2027 1st' }));
    await user.click(screen.getByRole('checkbox', { name: 'you get from Reed Between the Lines: Reed Receiver' }));
    const verdict = await screen.findByTestId('dynasty-verdict');
    expect(verdict.textContent).toMatch(/^pass: as a rebuilder, a rebuilder wants value and youth, and this sends them out\./);
    expect(within(kpi('verdict')).getByText('pass')).toBeInTheDocument();
  });

  it('degrades quietly when fantasycalc is down: the reason in muted text, the redraft analyzer still works', async () => {
    const { user } = setup('contender', { fcFails: true, route: '/trades?tab=dynasty' });
    expect(await screen.findByText(/dynasty values are unavailable right now, so teams cannot be labelled\. FantasyCalc is unavailable: FantasyCalc is down/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Contender or rebuilder, every team' })).not.toBeInTheDocument();
    // the picks are still listed, without values
    expect(await screen.findByRole('table', { name: 'Future picks by team' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'analyzer' }));
    await user.click(screen.getByRole('checkbox', { name: 'you send: Backup Wideout' }));
    expect(await screen.findByText('your lineup, wks 6–8')).toBeInTheDocument();
    expect(screen.getByText(/dynasty values are unavailable right now, so only this season is scored/)).toBeInTheDocument();
    expect(screen.queryByText('net dynasty value')).not.toBeInTheDocument();
  });
});

describe('dynasty mode in a redraft league', () => {
  it('stays off until you flip the explore switch, then explains the values are dynasty values', async () => {
    const sleeper = createFakeSleeper({ fantasyCalcRows: fcRows('contender') });
    const { user } = renderApp({ linked, route: '/trades?tab=dynasty', sleeper });
    const toggle = await screen.findByRole('button', { name: 'dynasty mode: explore' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('heading', { level: 2, name: 'future picks' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Contender or rebuilder, every team' })).not.toBeInTheDocument();
    expect(sleeper.fantasyCalc).not.toHaveBeenCalled();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('table', { name: 'Contender or rebuilder, every team' })).toBeInTheDocument();
    expect(screen.getByText(/this is a redraft league\. everything here uses fantasycalc dynasty values, which are not redraft values/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'future picks' })).toBeInTheDocument();
    expect(screen.getByText(/this is a redraft league, so every team holds its own picks/)).toBeInTheDocument();
    expect(sleeper.fantasyCalc).toHaveBeenCalledWith(expect.objectContaining({ isDynasty: true }), expect.anything());

    await user.click(toggle);
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2, name: 'future picks' })).not.toBeInTheDocument());
  });
});
