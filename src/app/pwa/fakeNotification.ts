/* A stand-in for the browser's Notification, for the alerts tests: records every notification shown, and answers requestPermission like a browser would. */
import { vi } from 'vitest';

export interface Shown { title: string; options: NotificationOptions }

export function stubNotification(initial: NotificationPermission, answer: NotificationPermission = 'granted') {
  const shown: Shown[] = [];
  class Fake {
    static permission: NotificationPermission = initial;
    static requestPermission = vi.fn(async () => { Fake.permission = answer; return answer; });
    onclick: (() => void) | null = null;
    constructor(title: string, options: NotificationOptions = {}) { shown.push({ title, options }); }
    close() {}
  }
  vi.stubGlobal('Notification', Fake);
  return { shown, Fake };
}
