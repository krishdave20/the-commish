import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALERTS_KEY, loadAlertsEnabled } from '../../app/pwa/alertsStore';
import { stubNotification } from '../../app/pwa/fakeNotification';
import { resetInstallForTests, watchInstall } from '../../app/pwa/install';
import type { BeforeInstallPromptEvent } from '../../app/pwa/install';
import { AppSection } from './AppSection';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA = navigator.userAgent;

function setUserAgent(ua: string) { Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true }); }
function standalone(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
}
/** the browser offers an install prompt */
function offer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const ev = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  ev.prompt = vi.fn().mockResolvedValue(undefined);
  ev.userChoice = Promise.resolve({ outcome });
  act(() => { window.dispatchEvent(ev); });
  return ev;
}
const show = () => render(<AppSection />);

beforeEach(() => { resetInstallForTests(); watchInstall(); localStorage.removeItem(ALERTS_KEY); });
afterEach(() => { cleanup(); setUserAgent(UA); vi.unstubAllGlobals(); localStorage.clear(); });

describe('install', () => {
  it('shows an install button when the browser offers one, and opens its prompt on that tap', async () => {
    show();
    expect(screen.queryByRole('button', { name: 'install the commish', hidden: true })).toBeNull();
    const ev = offer();
    expect(ev.defaultPrevented).toBe(true); // the browser's own mini bar is held back
    const button = screen.getByRole('button', { name: 'install the commish', hidden: true });
    await act(async () => { fireEvent.click(button); });
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    // accepted: the section says it is installed
    expect(screen.getByText('installed', { selector: '.chip' })).toBeInTheDocument();
  });

  it('a dismissed prompt leaves a note and no button (the browser must offer again)', async () => {
    show();
    offer('dismissed');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'install the commish', hidden: true })); });
    expect(screen.queryByRole('button', { name: 'install the commish', hidden: true })).toBeNull();
  });

  it('on iPhone shows Share → Add to Home Screen instead, with the drawn share icon', () => {
    setUserAgent(IPHONE);
    const { container } = show();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.getByText(/tap the share button/)).toBeInTheDocument();
    expect(container.querySelector('svg.pwa-share')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /install the commish/, hidden: true })).toBeNull();
  });

  it('in standalone mode says "installed" and offers nothing to install', () => {
    standalone(true);
    setUserAgent(IPHONE);
    show();
    expect(screen.getByText('installed', { selector: '.chip' })).toBeInTheDocument();
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
  });

  it('an iPhone user agent beats nothing, but a real prompt beats the iPhone steps', () => {
    setUserAgent(IPHONE);
    show();
    offer();
    expect(screen.getByRole('button', { name: 'install the commish', hidden: true })).toBeInTheDocument();
    expect(screen.queryByText(/tap the share button/)).toBeNull();
  });

  it('elsewhere, with no prompt, points at the address bar', () => {
    show();
    expect(screen.getByText(/has not offered an install button/)).toBeInTheDocument();
  });
});

describe('alerts', () => {
  const on = () => screen.getByRole('radio', { name: 'alerts: on', hidden: true });

  it('says plainly that alerts only arrive while the app is open', () => {
    show();
    expect(screen.getByText('alerts only arrive while the commish is open (no server, by design).')).toBeInTheDocument();
  });

  it('does not ask for permission until the toggle is tapped, then switches on and offers a test', async () => {
    const { Fake, shown } = stubNotification('default', 'granted');
    show();
    expect(Fake.requestPermission).not.toHaveBeenCalled();
    expect(on()).toHaveAttribute('aria-checked', 'false');
    await act(async () => { fireEvent.click(on()); });
    expect(Fake.requestPermission).toHaveBeenCalledTimes(1);
    expect(loadAlertsEnabled()).toBe(true);
    expect(on()).toHaveAttribute('aria-checked', 'true');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'send a test alert', hidden: true })); });
    expect(shown.map((s) => s.title)).toEqual(['the commish']);
  });

  it('already allowed: switching on does not prompt again', async () => {
    const { Fake } = stubNotification('granted');
    show();
    await act(async () => { fireEvent.click(on()); });
    expect(Fake.requestPermission).not.toHaveBeenCalled();
    expect(loadAlertsEnabled()).toBe(true);
  });

  it('a refused prompt leaves alerts off and says why', async () => {
    stubNotification('default', 'denied');
    show();
    await act(async () => { fireEvent.click(on()); });
    expect(loadAlertsEnabled()).toBe(false);
    expect(screen.getByText(/blocked for this site/)).toBeInTheDocument();
  });

  it('blocked earlier: no prompt, a note about the browser settings', async () => {
    const { Fake } = stubNotification('denied');
    show();
    await act(async () => { fireEvent.click(on()); });
    expect(Fake.requestPermission).not.toHaveBeenCalled();
    expect(screen.getByText(/blocked for this site/)).toBeInTheDocument();
  });

  it('on iPhone in Safari (no Notification API) asks for the Home Screen app first', async () => {
    vi.stubGlobal('Notification', undefined);
    setUserAgent(IPHONE);
    show();
    await act(async () => { fireEvent.click(on()); });
    expect(loadAlertsEnabled()).toBe(false);
    expect(screen.getByText(/only allow alerts from an app on the Home Screen/)).toBeInTheDocument();
  });

  it('switching off is immediate', async () => {
    stubNotification('granted');
    show();
    await act(async () => { fireEvent.click(on()); });
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'alerts: off', hidden: true })); });
    expect(loadAlertsEnabled()).toBe(false);
  });
});
