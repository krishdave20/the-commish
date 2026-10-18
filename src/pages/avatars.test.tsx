import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../app/testUtils';
import { sampleAccount, sampleLoadModel, sampleModel } from '../test/fakes';
import type { Model } from '../engine';

/* Headshots beside player names: the lists named in docs/WEB_APP_NOTES.md ("Cues from a reference app"). Each avatar is decorative
   (alt="" or a hidden monogram) and the visible name stays the accessible name. */

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const linked = [sampleAccount()];

/** The sample league with Sleeper-style numeric ids, so the avatars ask for a thumbnail instead of drawing a monogram. */
function numericModel(): Model {
  const m = sampleModel();
  const id = new Map(m.players.map((p, i) => [p.pid, String(4000 + i)]));
  const re = (pid: string) => id.get(pid) ?? pid;
  for (const p of m.players) p.pid = re(p.pid);
  for (const t of m.teams) t.starters = t.starters.map(re);
  m.ideas = m.ideas.map((x) => ({ ...x, givePid: re(x.givePid), getPid: re(x.getPid) }));
  return m;
}
const loadModel = sampleLoadModel(numericModel);

const decorative = (root: HTMLElement) => {
  for (const a of root.querySelectorAll('.avatar')) expect(a).toHaveAttribute('aria-hidden', 'true');
  for (const img of root.querySelectorAll('img.avatar-img')) expect(img).toHaveAttribute('alt', '');
};

describe('headshot rollout', () => {
  it('locker room lineup and roster', async () => {
    const { user } = renderApp({ linked, route: '/team', loadModel });
    const lineup = await screen.findByRole('table', { name: 'Lineup for week 5' });
    const row = within(lineup).getByRole('link', { name: 'Alex Arm' }).closest('tr')!;
    expect(row.querySelector('img.avatar-img')).toHaveAttribute('src', expect.stringMatching(/^https:\/\/sleepercdn\.com\/content\/nfl\/players\/thumb\/\d+\.jpg$/));
    expect(row.querySelector('.avatar')).toHaveAttribute('data-size', '28');
    decorative(lineup);
    await user.click(screen.getByRole('radio', { name: 'roster' }));
    const roster = await screen.findByRole('table', { name: 'Roster' });
    expect(within(roster).getAllByRole('link').length).toBe(roster.querySelectorAll('.avatar').length);
    decorative(roster);
  });

  it('waiver wire rows', async () => {
    renderApp({ linked, route: '/waivers', loadModel });
    const table = await screen.findByRole('table', { name: 'Waiver wire' });
    const row = within(table).getByRole('link', { name: 'Free Agent Fran' }).closest('tr')!;
    expect(row.querySelector('.avatar img')).toBeInTheDocument();
    decorative(table);
  });

  it('trade block: the pick lists and the handshake deals', async () => {
    const { user } = renderApp({ linked, route: '/trades', loadModel });
    await user.selectOptions(await screen.findByLabelText('trade partner'), 'Reed Between the Lines');
    const send = screen.getByRole('group', { name: 'you send' });
    const label = within(send).getByRole('checkbox', { name: 'you send: Backup Wideout' }).closest('label')!;
    expect(label.querySelector('.avatar')).toHaveAttribute('data-size', '20');
    decorative(send);
    await user.click(screen.getByRole('radio', { name: 'handshake deals' }));
    const deals = await screen.findByRole('table', { name: 'Handshake deals' });
    expect(within(deals).getByRole('link', { name: 'Backup Wideout' }).closest('td')!.querySelector('.avatar')).toBeInTheDocument();
    expect(within(deals).getByRole('link', { name: 'Reed Receiver' }).closest('td')!.querySelector('.avatar')).toBeInTheDocument();
    decorative(deals);
  });

  it('scouting report: search rows and the 40 px profile header', async () => {
    const { user } = renderApp({ linked, route: '/players', loadModel });
    await user.type(await screen.findByLabelText('search players'), 'wal');
    const table = await screen.findByRole('table', { name: 'Player search results' });
    const row = within(table).getByRole('link', { name: 'Walt Wideout' }).closest('tr')!;
    expect(row.querySelector('.avatar')).toHaveAttribute('data-size', '28');
    decorative(table);
    await user.click(within(table).getByRole('link', { name: 'Walt Wideout' }));
    const back = await screen.findByRole('link', { name: '← all players' });
    expect(back.parentElement!.querySelector('.avatar')).toHaveAttribute('data-size', '40');
  });
});
