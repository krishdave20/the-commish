import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleAccount, FAKE_AS_OF } from '../test/fakes';
import { renderApp } from '../app/testUtils';
import { PageHeader } from './PageHeader';

const base = { asOf: FAKE_AS_OF, fromCache: false, stale: false, error: undefined, loading: false, refresh: () => Promise.resolve() };

describe('PageHeader', () => {
  it('shows the kicker, title and as-of stamp', () => {
    render(<PageHeader kicker="Standings" title="League race" data={base} />);
    expect(screen.getByText('Standings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'League race' })).toBeInTheDocument();
    expect(screen.getByText('Data as of Fri, Oct 16, 4:05 PM')).toBeInTheDocument();
    expect(screen.queryByText('cached')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('keeps the title and kicker together on one line and the stamp and Refresh in a small line of their own', () => {
    const { container } = render(<PageHeader kicker="Standings" title="League race" data={base} />);
    const head = container.querySelector('.head-title')!;
    expect(head).toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(head).toContainElement(screen.getByText('Standings'));
    const stamp = container.querySelector('.stamp-row')!;
    expect(stamp).toContainElement(screen.getByText('Data as of Fri, Oct 16, 4:05 PM'));
    expect(stamp).toContainElement(screen.getByRole('button', { name: 'Refresh' }));
    expect(head).not.toContainElement(screen.getByRole('button', { name: 'Refresh' }));
  });

  it('shows cached and stale chips', () => {
    render(<PageHeader kicker="k" title="t" data={{ ...base, fromCache: true, stale: true }} />);
    expect(screen.getByText('cached')).toBeInTheDocument();
    expect(screen.getByText('stale')).toBeInTheDocument();
  });

  it('shows a progress bar and disables Refresh while loading', () => {
    render(<PageHeader kicker="k" title="t" data={{ ...base, loading: true }} />);
    expect(screen.getByRole('progressbar', { name: 'Refreshing data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
  });

  it('draws the loading bar as a yard-line track with a football: still and at midfield with nothing to measure', () => {
    render(<PageHeader kicker="k" title="t" data={{ ...base, loading: true }} />);
    const bar = screen.getByRole('progressbar', { name: 'Refreshing data' });
    expect(bar).toHaveClass('yard');
    expect(bar).toHaveAttribute('data-mode', 'indeterminate');
    expect(bar.querySelector('.yard-ball svg')).toBeInTheDocument();
    // jsdom counts as reduced motion: the ball does not roll
    expect(bar).toHaveAttribute('data-motion', 'still');
  });

  it('advances the ball with the pull: the right yard for the share done', () => {
    const { rerender } = render(<PageHeader kicker="k" title="t" data={{ ...base, loading: true, progress: { done: 10, total: 40, label: 'a' } }} />);
    const ball = () => parseFloat((screen.getByRole('progressbar').querySelector('.yard-ball') as HTMLElement).style.left);
    const early = ball();
    rerender(<PageHeader kicker="k" title="t" data={{ ...base, loading: true, progress: { done: 30, total: 40, label: 'b' } }} />);
    expect(ball()).toBeGreaterThan(early);
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-mode', 'determinate');
  });

  it('explains a network failure when saved data is shown', () => {
    render(<PageHeader kicker="k" title="t" data={{ ...base, fromCache: true, error: 'offline' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('showing the saved copy');
  });

  it('calls refresh on click', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    render(<PageHeader kicker="k" title="t" data={{ ...base, refresh }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('PageHeader in the app', () => {
  it('Refresh asks the api for the league with force: true', async () => {
    const { api, user } = renderApp({ linked: [sampleAccount()], route: '/' });
    await screen.findByText('Data as of Fri, Oct 16, 4:05 PM');
    expect(api.leagueBundle).toHaveBeenCalledWith('L1', undefined);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(api.leagueBundle).toHaveBeenCalledWith('L1', { force: true });
  });

  it('shows the pull progress while the model loads', () => {
    render(<PageHeader kicker="k" title="t" data={{ ...base, loading: true, progress: { done: 23, total: 41, label: 'week 7 projections' } }} />);
    expect(screen.getByText('pulling week 7 projections · 23 of 41')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Refreshing data' })).toHaveAttribute('aria-valuenow', '23');
  });
});
