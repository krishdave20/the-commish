import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../app/testUtils';
import type { LoadModel } from '../../app/loadModel';
import { createFakeSleeper, sampleAccount, sampleLeague, sampleLoadModel, sampleTakes, stubBuildTakes } from '../../test/fakes';
import type { TakeInputs } from '../../takes/types';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const linked = [sampleAccount()];
const articles = () => screen.getAllByRole('article');
const card = (headline: RegExp | string) => screen.getByRole('article', { name: new RegExp(`^Take: ${typeof headline === 'string' ? headline : headline.source}`) });

describe('hot takes feed (/takes)', () => {
  it('renders a card per take, ranked as the engine returned them, with every field', async () => {
    renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    expect(await screen.findByRole('heading', { level: 1, name: 'hot takes' })).toBeInTheDocument();
    expect(screen.getByText('rule-based reads from real numbers · week 5')).toBeInTheDocument();
    await waitFor(() => expect(articles()).toHaveLength(5));

    const heads = articles().map((a) => within(a).getByRole('heading', { level: 3 }).textContent);
    expect(heads).toEqual(sampleTakes().map((t) => t.headline));

    const spike = card('Walt Wideout’s snap share');
    expect(spike).toHaveAttribute('data-tone', 'good');
    expect(within(spike).getByText('94% of snaps vs 76% over the previous 3 weeks, 3 games')).toBeInTheDocument();
    expect(within(spike).getByText('He starts for you at WR1.')).toBeInTheDocument();
    expect(within(spike).getByText('why it matters for you')).toBeInTheDocument();
    expect(within(spike).getByText('sources: nflverse')).toBeInTheDocument();
    expect(within(spike).getByText('sample: 3 weeks')).toBeInTheDocument();

    // the engine's backtest line sits quietly under the stat line, only where the take has one
    expect(within(spike).getByText('2025 backtest: beat projection 45% of the time vs 37% for all players (119 takes)')).toHaveClass('take-track');
    expect(within(card('Reed Receiver')).queryByText(/backtest/)).not.toBeInTheDocument();

    const sell = card('Rex Runner');
    expect(sell).toHaveAttribute('data-tone', 'bad');
    expect(within(sell).getByText('last season (2025)')).toBeInTheDocument();
    expect(within(sell).getByText('sources: nflverse, ftn data via nflverse')).toBeInTheDocument();
    expect(card('Reed Receiver')).toHaveAttribute('data-tone', 'watch');
    // no why-line and no data chip when the take has none
    expect(within(card('Reed Receiver')).queryByText('why it matters for you')).not.toBeInTheDocument();
    expect(within(card('Reed Receiver')).queryByText('proxy')).not.toBeInTheDocument();
    expect(within(card('Free Agent Fran')).getByText('proxy')).toBeInTheDocument();
  });

  it('shows data through week N and the attribution when nflverse is used', async () => {
    renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    expect(await screen.findByText(/data through week 6 · 5 takes/)).toBeInTheDocument();
    expect(screen.getByText(/Play-by-play and snap data: nflverse\. Charting data: FTN Data via nflverse\./)).toBeInTheDocument();
    expect(screen.getByText(/Values: FantasyCalc\./)).toBeInTheDocument();
    expect(screen.getByText(/every take is a template filled with real numbers/)).toBeInTheDocument();
  });

  it('filters by scope and by detector kind', async () => {
    const { user } = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(articles()).toHaveLength(5));

    await user.click(screen.getByRole('radio', { name: 'my players' }));
    expect(articles()).toHaveLength(2);
    await user.click(screen.getByRole('radio', { name: 'waiver wire' }));
    expect(articles()).toHaveLength(1);
    expect(card('Free Agent Fran')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'league-wide' }));
    expect(articles()).toHaveLength(2); // the trade target and the dynasty mover
    await user.click(screen.getByRole('radio', { name: 'all' }));
    expect(articles()).toHaveLength(5);

    await user.selectOptions(screen.getByLabelText('Detector kind'), 'sell_high');
    expect(articles()).toHaveLength(1);
    expect(card('Rex Runner')).toBeInTheDocument();
    // a scope and a kind that do not meet say so instead of the quiet-week line
    await user.click(screen.getByRole('radio', { name: 'waiver wire' }));
    expect(screen.getByText('nothing in this filter. try another.')).toBeInTheDocument();
  });

  it('offers only the detector kinds that fired, with counts', async () => {
    renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(articles()).toHaveLength(5));
    const select = screen.getByLabelText('Detector kind');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['all detectors', 'usage spike (1)', 'sell high (1)', 'waiver riser (1)', 'buy low (1)', 'dynasty mover (1)']);
  });

  it('says it is a quiet week when no take clears the bar', async () => {
    renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes(() => []) });
    expect(await screen.findByText('quiet week. no takes clear the bar.')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('still renders the takes that remain without nflverse', async () => {
    const build = stubBuildTakes();
    build.mockImplementation((inputs: TakeInputs) => sampleTakes().filter((t) => inputs.nflverse || !t.sources.includes('nflverse')));
    renderApp({ linked, route: '/takes', buildTakes: build });
    await waitFor(() => expect(articles()).toHaveLength(1));
    expect(card('Quinn Quarterback')).toBeInTheDocument();
    expect(build.mock.calls.at(-1)![0].nflverse).toBeNull();
    expect(screen.getByText(/the nightly nflverse update has not landed/)).toBeInTheDocument();
    expect(screen.getByText(/no nflverse data yet · 1 take$/)).toBeInTheDocument();
    expect(screen.queryByText(/Play-by-play and snap data/)).not.toBeInTheDocument();
  });

  it('falls back to the quiet-week line, not a crash, when no nflverse means no takes at all', async () => {
    renderApp({ linked, route: '/takes', buildTakes: stubBuildTakes(() => []) });
    expect(await screen.findByText('quiet week. no takes clear the bar.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'hot takes' })).toBeInTheDocument();
  });

  it('survives an engine that throws', async () => {
    const build = stubBuildTakes();
    build.mockImplementation(() => { throw new Error('bad detector'); });
    renderApp({ linked, route: '/takes', nflverse: true, buildTakes: build });
    expect(await screen.findByText(/the takes engine hit a snag, so the feed is empty\. bad detector/)).toBeInTheDocument();
    expect(screen.getByText('quiet week. no takes clear the bar.')).toBeInTheDocument();
  });

  it('keeps the page header with the as-of stamp and Refresh, and Refresh reloads nflverse too', async () => {
    const { user, nflverse } = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    expect(await screen.findByText('Data as of Fri, Oct 16, 4:05 PM')).toBeInTheDocument();
    await waitFor(() => expect(nflverse.manifest).toHaveBeenCalled());
    nflverse.manifest.mockClear();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(nflverse.manifest).toHaveBeenCalledWith({ force: true }));
  });
});

describe('a long feed', () => {
  it('draws 30 cards and grows on request, keeping the engine’s order', async () => {
    const many = () => Array.from({ length: 65 }, (_, i) => ({ ...sampleTakes()[0]!, id: `usage_spike:p${i}:6`, pid: `p${i}`, player: `Player ${i}`, headline: `Headline ${i}` }));
    const { user } = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes(many) });
    await waitFor(() => expect(articles()).toHaveLength(30));
    expect(screen.getByText('showing 30 of 65')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'show 30 more' }));
    expect(articles()).toHaveLength(60);
    await user.click(screen.getByRole('button', { name: 'show 5 more' }));
    expect(articles()).toHaveLength(65);
    expect(articles()[64]).toHaveAccessibleName('Take: Headline 64');
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
  });
});

describe('what the engine is given (useTakes)', () => {
  it('assembles the inputs from the model, nflverse, trending adds, the watchlist and nothing for trade targets', async () => {
    window.localStorage.setItem('wr.watchlist.v1', JSON.stringify(['x2']));
    const build = stubBuildTakes();
    renderApp({ linked, route: '/takes', nflverse: true, buildTakes: build });
    await waitFor(() => {
      const last = build.mock.calls.at(-1)?.[0];
      expect(last?.nflverse?.weekly.length).toBeGreaterThan(0);
      expect(last?.trendingAdds).toEqual([{ player_id: 'fa1', count: 12400 }]);
    });
    const inputs = build.mock.calls.at(-1)![0];
    expect(inputs.season).toBe('2026');
    expect(inputs.week).toBe(5);
    expect(inputs.model.meta.leagueId).toBe('L1');
    expect(inputs.nflverse!.manifest.throughWeek).toBe(6);
    expect(inputs.nflverse!.coverage).toMatchObject({ season: '2025', isCurrent: false });
    expect(inputs.watchlist).toEqual(['x2']);
    expect(inputs.tradeTargets).toEqual([]);
    expect(inputs.isDynasty).toBe(false);
    expect(inputs.fantasyCalc).toBeNull(); // redraft league: FantasyCalc is not asked for
  });

  it('adds FantasyCalc values for a dynasty league, and carries on when FantasyCalc is down', async () => {
    const dynasty: LoadModel = async (ctx) => {
      const r = await sampleLoadModel()(ctx);
      return { ...r, extras: { ...r.extras!, league: { ...sampleLeague, settings: { ...sampleLeague.settings, type: 2 } } } };
    };
    const build = stubBuildTakes();
    renderApp({ linked, route: '/takes', loadModel: dynasty, buildTakes: build });
    await waitFor(() => expect(build.mock.calls.at(-1)?.[0].fantasyCalc ?? null).not.toBeNull());
    const inputs = build.mock.calls.at(-1)![0];
    expect(inputs.isDynasty).toBe(true);
    expect(inputs.fantasyCalc!.t1wr).toMatchObject({ value: 5234, trend30Day: -150 });

    cleanup();
    const down = stubBuildTakes();
    renderApp({ linked, route: '/takes', loadModel: dynasty, buildTakes: down, sleeper: createFakeSleeper({ fantasyCalcFails: true }) });
    await waitFor(() => expect(articles()).toHaveLength(5));
    expect(down.mock.calls.at(-1)![0].fantasyCalc).toBeNull();
    expect(down.mock.calls.at(-1)![0].isDynasty).toBe(true);
  });

  it('does not run the engine until the model is built', async () => {
    const build = stubBuildTakes();
    renderApp({ linked, route: '/takes', loadModel: () => new Promise(() => {}), buildTakes: build });
    expect(await screen.findByText(/pulling your league and building the model/)).toBeInTheDocument();
    expect(build).not.toHaveBeenCalled();
  });
});

describe('take actions', () => {
  it('opens the profile, where the player’s takes are listed', async () => {
    const { user } = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(articles()).toHaveLength(5));
    const link = within(card('Walt Wideout')).getByRole('link', { name: 'profile: Walt Wideout' });
    expect(link).toHaveAttribute('href', '/players/t1wr');
    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'Walt Wideout' })).toBeInTheDocument();
    const section = (await screen.findByRole('heading', { level: 2, name: 'hot takes' })).closest('section')!;
    await waitFor(() => expect(within(section).getAllByRole('article')).toHaveLength(1));
    expect(section).toHaveTextContent('Walt Wideout’s snap share jumped 18 points');
    expect(section).not.toHaveTextContent('Rex Runner');
    // on his own page the card does not link back to himself
    expect(within(section).queryByRole('link', { name: /profile/ })).not.toBeInTheDocument();
  });

  it('toggles the watchlist, which the engine sees on its next run', async () => {
    const build = stubBuildTakes();
    const { user } = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: build });
    await waitFor(() => expect(articles()).toHaveLength(5));
    const fran = card('Free Agent Fran');
    await user.click(within(fran).getByRole('button', { name: 'watch Free Agent Fran' }));
    expect(JSON.parse(window.localStorage.getItem('wr.watchlist.v1')!)).toEqual(['fa1']);
    const on = within(card('Free Agent Fran')).getByRole('button', { name: 'watching Free Agent Fran' });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(build.mock.calls.at(-1)![0].watchlist).toEqual(['fa1']));
    await user.click(on);
    expect(JSON.parse(window.localStorage.getItem('wr.watchlist.v1')!)).toEqual([]);
  });

  it('“try in the lab” adds a free agent (dropping a player) to the what-if and opens the locker room', async () => {
    const { user } = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(articles()).toHaveLength(5));
    await user.click(within(card('Free Agent Fran')).getByRole('button', { name: 'try in the lab: Free Agent Fran' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'locker room' })).toBeInTheDocument();
    const saved = JSON.parse(window.localStorage.getItem('wr.scenario.L1')!);
    expect(saved.adds).toEqual(['fa1']);
    expect(saved.drops).toHaveLength(1);
    expect(saved.drops[0]).not.toBe('fa1');
    expect(await screen.findByText(/looking at a what-if: add Free Agent Fran/)).toBeInTheDocument();
  });

  it('“try in the lab” pins one of my players on good news and benches him on bad news', async () => {
    const { user } = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(articles()).toHaveLength(5));
    await user.click(within(card('Walt Wideout')).getByRole('button', { name: 'try in the lab: Walt Wideout' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'locker room' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('wr.scenario.L1')!)).toMatchObject({ pins: ['t1wr'], benches: [], adds: [] });

    cleanup();
    window.localStorage.clear();
    const second = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(articles()).toHaveLength(5));
    await second.user.click(within(card('Rex Runner')).getByRole('button', { name: 'try in the lab: Rex Runner' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'locker room' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('wr.scenario.L1')!)).toMatchObject({ benches: ['t1rb'], pins: [] });
  });

  it('only shows the actions the take lists', async () => {
    renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(articles()).toHaveLength(5));
    const quinn = card('Quinn Quarterback');
    expect(within(quinn).queryByRole('button', { name: /in the lab/ })).not.toBeInTheDocument();
    expect(within(quinn).queryByRole('link', { name: /trade block/ })).not.toBeInTheDocument();
    expect(within(quinn).getByRole('button', { name: /^watch / })).toBeInTheDocument();
  });

  it('“trade block” opens the trade block with a player of mine ticked on my side', async () => {
    const { user } = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(articles()).toHaveLength(5));
    const link = within(card('Walt Wideout')).getByRole('link', { name: 'trade block: Walt Wideout' });
    expect(link).toHaveAttribute('href', '/trades?player=t1wr');
    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'trade block' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'you send: Walt Wideout' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'you send: Rex Runner' })).not.toBeChecked();
  });

  it('“trade block” picks the other manager as the partner for a trade target', async () => {
    const { user } = renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(articles()).toHaveLength(5));
    await user.click(within(card('Reed Receiver')).getByRole('link', { name: 'trade block: Reed Receiver' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'trade block' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'you get from Reed Between the Lines: Reed Receiver' })).toBeChecked();
    expect(screen.getByLabelText('trade partner')).toHaveValue('2');
  });
});

describe('player profile takes', () => {
  it('lists only that player’s takes', async () => {
    renderApp({ linked, route: '/players/fa1', buildTakes: stubBuildTakes() });
    const section = (await screen.findByRole('heading', { level: 2, name: 'hot takes' })).closest('section')!;
    await waitFor(() => expect(within(section).getAllByRole('article')).toHaveLength(1));
    expect(within(section).getByText('Free Agent Fran is getting added and getting looks')).toBeInTheDocument();
    expect(within(section).getByText('proxy')).toBeInTheDocument();
  });

  it('says it is quiet when he has none', async () => {
    renderApp({ linked, route: '/players/t1qb', buildTakes: stubBuildTakes() });
    expect(await screen.findByText('quiet week. no takes on him clear the bar.')).toBeInTheDocument();
  });

  it('waits for the model', async () => {
    renderApp({ linked, route: '/players/t1qb', loadModel: () => new Promise(() => {}), buildTakes: stubBuildTakes() });
    expect(await screen.findByText(/the takes need your league’s model/)).toBeInTheDocument();
  });
});
