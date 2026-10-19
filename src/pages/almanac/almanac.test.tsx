import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chainClient, renameUsers, threeSeasons } from '../../engine/almanac/test-helpers';
import type { HistoryData } from '../../engine/almanac';
import { savePrefs } from '../../app/prefs';
import { renderApp } from '../../app/testUtils';
import { createFakeApi, createFakeSleeper, sampleAccount, sampleBundle } from '../../test/fakes';

afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); });
beforeEach(() => { savePrefs({ smartNav: false }); });

const linked = [sampleAccount()];

/** The three hand-built seasons, with Ann as the sample user (u1) and the newest season as the sample league L1. */
function history(): HistoryData {
  const h = renameUsers(threeSeasons(), { uA: 'u1', uB: 'u2', uC: 'u3', uD: 'u4', uE: 'u5' });
  h.seasons[2]!.leagueId = 'L1';
  return h;
}

function app(h: HistoryData, route = '/almanac') {
  const chain = chainClient(h);
  const sleeper = Object.assign(createFakeSleeper(), chain);
  const bundle = sampleBundle({ ...chain.leagues[0]!, name: 'Sample League' });
  const api = createFakeApi({ bundles: { L1: bundle } });
  return { chain, ...renderApp({ linked, sleeper, api, route }) };
}

describe('the record book page', () => {
  it('opens on champions by season, newest first, with the champion, runner-up and toilet bowl winner of each', async () => {
    app(history());
    await screen.findByRole('heading', { level: 1, name: 'record book' });
    const table = await screen.findByRole('table', { name: 'Champions and toilet bowl winners by season' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['2026', '2025', '2024']);
    // 2024: Cy's Cats beat Ann's Aces in the final; Bo finished last
    const y24 = within(rows[2]!).getAllByRole('cell');
    expect(y24[1]).toHaveTextContent('Cats');
    expect(y24[2]).toHaveTextContent('Aces');
    expect(y24[3]).toHaveTextContent('Bears');
    expect(y24[3]).toHaveTextContent('last in the regular season');
    // 2025: Ann (roster 2 that year) is champion, and you
    expect(within(rows[1]!).getAllByRole('cell')[1]).toHaveTextContent(/Aces\s*Ann\s*you/);
    expect(within(rows[0]!).getAllByRole('cell')[1]).toHaveTextContent('in progress');
  });

  it('leads with the headline figures and where this season sits against history', async () => {
    app(history());
    const strip = await screen.findByRole('group', { name: "the league's history" });
    expect(within(strip).getByText('seasons on record').closest('.kpi')).toHaveTextContent('3');
    expect(within(strip).getByText('reigning champion').closest('.kpi')).toHaveTextContent('Aces');
    expect(within(strip).getByText('highest score ever').closest('.kpi')).toHaveTextContent('160.0');
    expect(await screen.findByText(/Aces’s 160\.0 in week 1 is the highest score in league history/)).toBeInTheDocument();
    expect(screen.getByText(/60\.0-point win over Cats in week 1 is the 3rd biggest blowout in league history/)).toBeInTheDocument();
  });

  it('shows the records, each with its season and week, and the top five behind a link', async () => {
    const { user } = app(history());
    await user.click(await screen.findByRole('radio', { name: 'records' }));
    const hi = await screen.findByRole('region', { name: 'highest score' });
    expect(hi).toHaveTextContent('160.0');
    expect(hi).toHaveTextContent('beat Cats 100.0 · 2026 week 1');
    const low = screen.getByRole('region', { name: 'lowest score' });
    expect(low).toHaveTextContent('50.0');
    expect(low).toHaveTextContent('2024 week 3');
    expect(screen.getByRole('region', { name: 'longest losing streak' })).toHaveTextContent('4');
    expect(screen.getByRole('region', { name: 'longest losing streak' })).toHaveTextContent('still going');
    expect(screen.getByRole('region', { name: 'closest game' })).toHaveTextContent('0.0');
    // the top five of the highest score sit in a closed disclosure until opened
    expect(within(hi).getByText('top 5')).toBeInTheDocument();
    // the best player week: a starter, never the bench player
    const player = screen.getByRole('region', { name: 'best player week' });
    expect(player).toHaveTextContent('52.2');
    expect(player.querySelector('.avatar')).not.toBeNull();
  });

  it('lists every manager in the all-time standings, sorted, with titles and playoff trips', async () => {
    const { user } = app(history());
    await user.click(await screen.findByRole('radio', { name: 'all-time' }));
    const table = await screen.findByRole('table', { name: 'All-time standings' });
    const rows = within(table).getAllByRole('row').slice(1);
    // Eve (2-0) leads, then Ann (6-1-1)
    expect(within(rows[0]!).getAllByRole('cell')[0]).toHaveTextContent('Eve');
    expect(within(rows[1]!).getAllByRole('cell')[0]).toHaveTextContent('Ann');
    expect(within(rows[1]!).getAllByRole('cell')[0]).toHaveTextContent('you');
    expect(rows[1]!).toHaveTextContent('6–1–1');
    expect(rows[1]!).toHaveTextContent('.813');
  });

  it('draws the head-to-head matrix, and opens the series from a cell', async () => {
    const { user } = app(history());
    await user.click(await screen.findByRole('radio', { name: 'rivalries' }));
    const matrix = await screen.findByRole('table', { name: /Head-to-head records/ });
    // Ann's row against Bo: 3 wins, no losses, a tie
    const ann = within(matrix).getByRole('row', { name: /^Ann/ });
    const cell = within(ann).getByRole('button', { name: /^Ann against Bo: \S+ \(3 wins, 0 losses, 1 ties\), open the rivalry$/ });
    expect(cell).toHaveTextContent('3–0–1');
    await user.click(cell);
    const drawer = await screen.findByRole('dialog', { name: 'Ann vs Bo' });
    expect(within(drawer).getByText('rivalry · 4 meetings')).toBeInTheDocument();
    expect(drawer).toHaveTextContent('16.3 points');
    expect(drawer).toHaveTextContent('2024, round 1: Ann won 105.0 to 100.0');
    const meetings = within(drawer).getByRole('table', { name: 'Every meeting between Ann and Bo' });
    expect(within(meetings).getAllByRole('row')).toHaveLength(5);
    expect(meetings).toHaveTextContent('2025 wk 1');
    expect(within(meetings).getByText('tie')).toBeInTheDocument();
    // the series is in the address, so Escape returns to the matrix
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens straight to a series from its link', async () => {
    app(history(), '/almanac?tab=rivalries&vs=u1~u3');
    expect(await screen.findByRole('dialog', { name: 'Ann vs Cy' })).toHaveTextContent('3–1');
  });

  it('names your closest series and the opponent you have met most', async () => {
    const { user } = app(history());
    await user.click(await screen.findByRole('radio', { name: 'rivalries' }));
    const rivals = await screen.findByRole('region', { name: 'your rivals' });
    // 2-1 against Di is the nearest to even
    expect(within(rivals).getByRole('button', { name: /Di/ })).toHaveTextContent('2–1 in 3 meetings');
    expect(within(rivals).getAllByRole('button', { name: /meeting/ })).toHaveLength(2);
  });
});

describe('a league with no history', () => {
  function one() {
    const h = history();
    const s = h.seasons[2]!;
    return app({ seasons: [s] });
  }

  it('shows this season so far and says the record book grows every week', async () => {
    one();
    expect(await screen.findByText(/this league has no earlier seasons on sleeper, so the record book starts with this one and grows every week/)).toBeInTheDocument();
    expect(screen.getByText('2026 so far, against the record book')).toBeInTheDocument();
    expect(screen.getByText(/in week 1 is the highest score this season/)).toBeInTheDocument();
    const strip = screen.getByRole('group', { name: "the league's history" });
    expect(within(strip).getByText('champion').closest('.kpi')).toHaveTextContent('not yet');
    expect(screen.getByText(/no season has finished yet/)).toBeInTheDocument();
  });

  it('still has records and a head to head', async () => {
    const { user } = one();
    await user.click(await screen.findByRole('radio', { name: 'records' }));
    expect(await screen.findByRole('region', { name: 'best record so far' })).toHaveTextContent('2–0');
    await user.click(screen.getByRole('radio', { name: 'rivalries' }));
    expect(await screen.findByRole('table', { name: /Head-to-head records/ })).toBeInTheDocument();
  });

  it('before a game has been played, says so', async () => {
    const h = history();
    const s = { ...h.seasons[2]!, throughWeek: 0, matchups: {} };
    app({ seasons: [s] });
    expect(await screen.findByText('no games have been played yet. the record book grows every week.')).toBeInTheDocument();
  });
});

describe('loading and failure', () => {
  it('says so when the history cannot be loaded', async () => {
    const h = history();
    const chain = chainClient(h);
    chain.rosters.mockRejectedValue(new Error('rosters are down'));
    const sleeper = Object.assign(createFakeSleeper(), chain);
    const api = createFakeApi({ bundles: { L1: sampleBundle({ ...chain.leagues[0]!, name: 'Sample League' }) } });
    renderApp({ linked, sleeper, api, route: '/almanac' });
    expect(await screen.findByText(/could not load the league’s history\. rosters are down/)).toBeInTheDocument();
  });

  it('works from the other weeks when one is missing, and says which', async () => {
    const chain = chainClient(history(), { failWeeks: [['S25', 2]] });
    const sleeper = Object.assign(createFakeSleeper(), chain);
    const api = createFakeApi({ bundles: { L1: sampleBundle({ ...chain.leagues[0]!, name: 'Sample League' }) } });
    renderApp({ linked, sleeper, api, route: '/almanac' });
    expect(await screen.findByText(/one week could not be loaded \(2025 wk 2\)/)).toBeInTheDocument();
  });

  it('in a development build, shows another league by id', async () => {
    const chain = chainClient(history());
    const sleeper = Object.assign(createFakeSleeper(), chain);
    renderApp({ linked, sleeper, route: '/almanac?league=S25' });
    expect(await screen.findByText(/development view: showing league S25/)).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Champions and toilet bowl winners by season' })).toBeInTheDocument();
  });
});
