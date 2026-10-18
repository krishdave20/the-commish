import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { applyNowParam, resetNowOverride } from '../app/moments/nowOverride';
import { renderApp } from '../app/testUtils';
import type { LeagueBundle, SleeperDraft } from '../data';
import { FAKE_AS_OF, createFakeApi, createFakeSleeper, sampleAccount, sampleBundle, sampleLeague, stubBuildTakes } from '../test/fakes';

afterEach(() => {
  cleanup();
  resetNowOverride();
  window.localStorage.clear();
});

const linked = [sampleAccount()];

function bundleWith(patch: (b: LeagueBundle) => void) {
  const b = sampleBundle(structuredClone(sampleLeague));
  patch(b);
  const api = createFakeApi();
  api.leagueBundle.mockResolvedValue({ data: b, asOf: FAKE_AS_OF, fromCache: false, stale: false });
  return { b, api };
}

const banner = () => screen.findByRole('complementary', { name: 'right now' });

/** Tuesday evening, a few hours before waivers run: the moment every in-season page can share. */
const tuesdayNight = () => applyNowParam('2026-10-20T20:00');

describe('the moment banner', () => {
  it('waiver wire: waivers process tonight, with the time left and a way to act', async () => {
    tuesdayNight();
    renderApp({ linked, route: '/waivers', buildTakes: stubBuildTakes() });
    const b = await banner();
    expect(b).toHaveTextContent(/waivers process (tonight|tomorrow|wednesday) at \d+:\d\d (am|pm)/);
    expect(b).toHaveTextContent(/· \d+h( \d+m)? left/);
    // you are on the waiver wire: the banner does not send you there
    expect(within(b).queryByRole('link')).not.toBeInTheDocument();
  });

  it('locker room: the same moment, with a link to the page that has the claims', async () => {
    tuesdayNight();
    renderApp({ linked, route: '/team', buildTakes: stubBuildTakes() });
    const b = await banner();
    await waitFor(() => expect(b).toHaveTextContent(/waivers process/));
    expect(within(b).getByRole('link', { name: /waiver wire/ })).toHaveAttribute('href', '/waivers');
  });

  it('trade block: the deadline, with the best handshake deal', async () => {
    tuesdayNight();
    const { api } = bundleWith((b) => { b.league.settings = { ...b.league.settings, trade_deadline: 6 }; });
    renderApp({ linked, api, route: '/trades', buildTakes: stubBuildTakes() });
    const b = await banner();
    expect(b).toHaveTextContent('trade deadline: week 6');
    expect(b).toHaveTextContent('best handshake deal: send Backup Wideout to Reed Between the Lines for Reed Receiver');
  });

  it('trade block: nothing to say, no banner', async () => {
    tuesdayNight();
    renderApp({ linked, route: '/trades', buildTakes: stubBuildTakes() });
    await screen.findByRole('heading', { level: 1, name: 'trade block' });
    expect(screen.queryByRole('complementary', { name: 'right now' })).not.toBeInTheDocument();
  });

  it('draft room: the countdown to the draft', async () => {
    const start = new Date(2026, 7, 23, 19, 0).getTime();
    applyNowParam('2026-08-20T14:48');
    const draft: SleeperDraft = { draft_id: 'L1-draft', league_id: 'L1', season: '2026', status: 'pre_draft', type: 'snake', start_time: start, settings: { teams: 6, rounds: 6 }, draft_order: { u1: 3 } };
    const { api } = bundleWith((b) => { b.league.status = 'pre_draft'; b.drafts = [draft]; });
    renderApp({ linked, api, route: '/draft', sleeper: createFakeSleeper({ draft }), buildTakes: stubBuildTakes() });
    const b = await banner();
    expect(b).toHaveTextContent('the draft starts in 3d 4h');
    expect(b).toHaveTextContent('you pick 3rd of 6');
  });
});
