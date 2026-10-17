import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../app/testUtils';
import { sampleAccount, sampleLoadModel, sampleModel } from '../test/fakes';

// every simulation is cancelled by a newer run: the worker runner resolves null
vi.mock('../engine/simRunner.ts', async (orig) => ({
  ...(await orig<typeof import('../engine/simRunner.ts')>()),
  runSimInWorker: vi.fn(async () => null),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('a cancelled simulation (null result)', () => {
  it('is ignored: the race page still renders from the model, with no errors', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = renderApp({ linked: [sampleAccount()], route: '/race' });
    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    expect(screen.getByText(/simming the season for the win-total chart/)).toBeInTheDocument();

    // picks still update marks and records immediately
    await user.click(await screen.findByRole('button', { name: 'you win out' }));
    expect(within(screen.getByRole('table', { name: 'Playoff machine standings' })).getByRole('img', { name: 'clinched a playoff spot' })).toBeInTheDocument();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('leaves a model that is waiting for its odds in the "simming…" state', async () => {
    renderApp({ linked: [sampleAccount()], route: '/race', loadModel: sampleLoadModel(() => ({ ...sampleModel(), oddsPending: true })) });
    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    expect(within(table).getAllByText('simming…')).toHaveLength(4);
  });

  it('keeps the lab usable', async () => {
    const { user } = renderApp({ linked: [sampleAccount()], route: '/team' });
    const lab = (await screen.findByRole('heading', { level: 2, name: 'the lab' })).closest('section')!;
    await user.click(within(lab).getByRole('button', { name: 'Add Free Agent Fran' }));
    expect(within(lab).getByRole('button', { name: 'Remove Free Agent Fran' })).toBeInTheDocument();
    expect(screen.getByText(/looking at a what-if/)).toBeInTheDocument();
  });
});
