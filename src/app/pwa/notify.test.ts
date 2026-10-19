import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubNotification } from './fakeNotification';
import { deliver, notificationPermission, requestAlertPermission } from './notify';

const notice = { title: 'waivers in 1 hour', body: 'set your claims', tag: 'waivers:1', to: '/waivers' };
afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'serviceWorker'); });

describe('notification permission', () => {
  it('reads the browser state: default, granted, denied', () => {
    for (const p of ['default', 'granted', 'denied'] as const) {
      stubNotification(p);
      expect(notificationPermission()).toBe(p);
    }
  });

  it('is "unsupported" where there is no Notification API (iOS Safari outside an installed app)', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(notificationPermission()).toBe('unsupported');
    expect(await requestAlertPermission()).toBe('unsupported');
  });

  it('asks only when requestAlertPermission is called, and reports the answer', async () => {
    const { Fake } = stubNotification('default', 'denied');
    expect(notificationPermission()).toBe('default');
    expect(Fake.requestPermission).not.toHaveBeenCalled();
    expect(await requestAlertPermission()).toBe('denied');
    expect(Fake.requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe('showing a notification', () => {
  it('shows nothing without permission', async () => {
    const { shown } = stubNotification('default');
    expect(await deliver(notice)).toBe(false);
    expect(shown).toEqual([]);
  });

  it('uses the service worker registration when there is one (the only way on an installed iPhone app)', async () => {
    const { shown } = stubNotification('granted');
    const showNotification = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: vi.fn().mockResolvedValue({ showNotification }) }, configurable: true });
    expect(await deliver(notice)).toBe(true);
    expect(showNotification).toHaveBeenCalledWith('waivers in 1 hour', expect.objectContaining({ body: 'set your claims', tag: 'waivers:1', data: { to: '/waivers' } }));
    expect(showNotification.mock.calls[0]![1].icon).toMatch(/icon-192\.png$/);
    expect(shown).toEqual([]);
  });

  it('falls back to new Notification with no worker', async () => {
    const { shown } = stubNotification('granted');
    expect(await deliver(notice)).toBe(true);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.title).toBe('waivers in 1 hour');
  });

  it('never throws when the browser refuses', async () => {
    stubNotification('granted');
    Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: vi.fn().mockResolvedValue({ showNotification: vi.fn().mockRejectedValue(new Error('no')) }) }, configurable: true });
    expect(await deliver(notice)).toBe(false);
  });
});
