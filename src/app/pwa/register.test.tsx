import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdatePrompt } from './UpdatePrompt';
import { WAITING_SETTLE_MS, applyUpdate, getSwState, registerServiceWorker, resetSwForTests } from './register';
import { SKIP_WAITING } from './swRoutes';

type Listener = () => void;

/** A stand-in for navigator.serviceWorker, with just what register.ts reads. */
function fakeWorkerApi(opts: { controller?: boolean; registerResult?: 'ok' | 'fail' } = {}) {
  const swListeners: Record<string, Listener[]> = {};
  const regListeners: Record<string, Listener[]> = {};
  const installing = { state: 'installing', listeners: [] as Listener[], addEventListener(_t: string, l: Listener) { this.listeners.push(l); }, postMessage: vi.fn() };
  const reg = {
    active: {} as object | null, waiting: null as unknown, installing: null as unknown,
    addEventListener: (t: string, l: Listener) => { (regListeners[t] ??= []).push(l); },
    update: vi.fn().mockResolvedValue(undefined),
  };
  const register = vi.fn(async () => { if (opts.registerResult === 'fail') throw new Error('blocked'); return reg; });
  const controllerListeners: Listener[] = [];
  const controller = { state: 'activated', addEventListener: (_t: string, l: Listener) => { controllerListeners.push(l); }, removeEventListener: () => {} };
  const api = {
    controller: opts.controller === false ? null : controller, register, ready: Promise.resolve(reg),
    addEventListener: (t: string, l: Listener) => { (swListeners[t] ??= []).push(l); },
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: api, configurable: true });
  return {
    api, reg, register, installing,
    /** a new worker is found, installs and ends up waiting */
    foundUpdate() {
      reg.installing = installing;
      regListeners.updatefound?.forEach((l) => l());
      installing.state = 'installed';
      reg.waiting = installing;
      installing.listeners.forEach((l) => l());
    },
    /** the waiting worker takes over by itself */
    activateWaiting() {
      installing.state = 'activated';
      reg.waiting = null;
      installing.listeners.forEach((l) => l());
    },
    controllerChange: () => swListeners.controllerchange?.forEach((l) => l()),
    /** the new worker claims the page while it is still activating, then finishes */
    claimThenActivate() {
      controller.state = 'activating';
      swListeners.controllerchange?.forEach((l) => l());
      controller.state = 'activated';
      controllerListeners.forEach((l) => l());
    },
    controller,
  };
}

beforeEach(() => { resetSwForTests(); });
afterEach(() => { cleanup(); Reflect.deleteProperty(navigator, 'serviceWorker'); vi.restoreAllMocks(); });

describe('service worker registration', () => {
  it('does nothing, and does not throw, where there is no service worker support (jsdom)', async () => {
    expect('serviceWorker' in navigator).toBe(false);
    await expect(registerServiceWorker({ force: true })).resolves.toBeNull();
    expect(getSwState().status).toBe('unsupported');
  });

  it('does not register outside a production build (the dev server has no worker file)', async () => {
    const f = fakeWorkerApi();
    await expect(registerServiceWorker()).resolves.toBeNull();
    expect(f.register).not.toHaveBeenCalled();
  });

  it('registers sw.js next to the page, so the scope is the folder the site is served from', async () => {
    const f = fakeWorkerApi();
    await registerServiceWorker({ force: true });
    expect(f.register).toHaveBeenCalledTimes(1);
    const [url, options] = f.register.mock.calls[0] as unknown as [string, { updateViaCache: string }];
    // base './' resolves against the page: /the-commish/ on GitHub Pages, never the domain root
    expect(url).toBe(new URL('./sw.js', document.baseURI).href);
    expect(options).toEqual({ updateViaCache: 'none' });
    expect(getSwState().status).toBe('ready');
    // twice is once
    await registerServiceWorker({ force: true });
    expect(f.register).toHaveBeenCalledTimes(1);
  });

  it('keeps going when registering fails', async () => {
    fakeWorkerApi({ registerResult: 'fail' });
    await expect(registerServiceWorker({ force: true })).resolves.toBeNull();
    expect(getSwState().status).toBe('error');
  });
});

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, WAITING_SETTLE_MS + 60)); });

describe('the update prompt', () => {
  async function setup(opts: Parameters<typeof fakeWorkerApi>[0] = {}) {
    const f = fakeWorkerApi(opts);
    await registerServiceWorker({ force: true });
    render(<UpdatePrompt />);
    return f;
  }

  it('shows "a new version is ready · reload" when a new worker is waiting, and reload tells it to take over', async () => {
    const f = await setup();
    expect(screen.queryByText('a new version is ready')).toBeNull();
    act(() => f.foundUpdate());
    expect(await screen.findByText('a new version is ready')).toBeInTheDocument();
    const reload = vi.fn();
    act(() => applyUpdate(reload));
    expect(f.installing.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING });
    expect(reload).not.toHaveBeenCalled(); // not until the new worker is in charge
    act(() => f.claimThenActivate());
    act(() => f.controllerChange());
    expect(reload).toHaveBeenCalledTimes(1); // once, and only after it finished activating
  });

  it('does not reload while the new worker is still activating', async () => {
    const f = await setup();
    act(() => f.foundUpdate());
    await screen.findByText('a new version is ready');
    const reload = vi.fn();
    act(() => applyUpdate(reload));
    f.controller.state = 'activating';
    act(() => f.controllerChange());
    expect(reload).not.toHaveBeenCalled();
    f.controller.state = 'activated';
    act(() => f.claimThenActivate());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('the reload button tells the waiting worker to take over', async () => {
    const f = await setup();
    act(() => f.foundUpdate());
    await userEvent.click(await screen.findByRole('button', { name: 'reload' }));
    expect(f.installing.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING });
  });

  it('"later" hides the prompt', async () => {
    const f = await setup();
    act(() => f.foundUpdate());
    await userEvent.click(await screen.findByRole('button', { name: 'later' }));
    expect(screen.queryByText('a new version is ready')).toBeNull();
  });

  it('the very first install is not an update (no controller yet), so nothing is offered', async () => {
    const f = await setup({ controller: false });
    act(() => f.foundUpdate());
    await settle();
    expect(screen.queryByText('a new version is ready')).toBeNull();
  });

  it('a worker that takes over by itself right after installing never flashes the prompt, and a shown prompt goes when it does', async () => {
    const f = await setup();
    act(() => f.foundUpdate());
    act(() => f.activateWaiting());
    await settle();
    expect(screen.queryByText('a new version is ready')).toBeNull();
    // and one that was shown, then activated elsewhere (another tab took it)
    act(() => f.foundUpdate());
    expect(await screen.findByText('a new version is ready')).toBeInTheDocument();
    act(() => f.activateWaiting());
    expect(screen.queryByText('a new version is ready')).toBeNull();
  });

  it('a worker already waiting from an earlier visit is offered at once', async () => {
    const f = fakeWorkerApi();
    f.reg.waiting = { postMessage: vi.fn(), state: 'installed', addEventListener: vi.fn() };
    render(<UpdatePrompt />);
    await act(async () => { await registerServiceWorker({ force: true }); });
    expect(screen.getByText('a new version is ready')).toBeInTheDocument();
  });
});
