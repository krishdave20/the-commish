import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, ctx } from '../../engine/moments/test-helpers';
import { moments } from '../../engine/moments';
import type { MomentCtx } from '../../engine/moments';
import { MomentsContext, NO_MOMENTS } from '../moments/momentsContext';
import { AlertsRunner } from './AlertsRunner';
import { ALERTS_KEY, ALERTS_MEMORY_KEY, saveAlertsEnabled } from './alertsStore';
import { stubNotification } from './fakeNotification';

function Moments({ c, previewing = false, children }: { c: MomentCtx; previewing?: boolean; children: ReactNode }) {
  const now = c.now.getTime();
  return <MomentsContext.Provider value={{ ...NO_MOMENTS, ctx: c, moments: moments(c), now, previewing }}>{children}</MomentsContext.Provider>;
}
const tree = (c: MomentCtx, previewing = false) => <Moments c={c} previewing={previewing}><AlertsRunner /></Moments>;

beforeEach(() => { localStorage.removeItem(ALERTS_KEY); localStorage.removeItem(ALERTS_MEMORY_KEY); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('AlertsRunner (the moments, through the scheduler, to a notification)', () => {
  it('raises "waivers in 1 hour" once while alerts are on, then stays quiet', () => {
    const { shown } = stubNotification('granted');
    saveAlertsEnabled(true);
    const c = ctx('2026-10-21T01:00');
    const view = render(tree(c));
    expect(shown.map((s) => s.title)).toEqual(['waivers in 1 hour']);
    expect(shown[0]!.options.tag).toBe(`waivers:${at('2026-10-21T02:00')}`);
    // the clock moves on a minute (new context, same alert): not sent twice, even after a reload
    view.rerender(tree(ctx('2026-10-21T01:01')));
    view.unmount();
    render(tree(ctx('2026-10-21T01:20')));
    expect(shown).toHaveLength(1);
  });

  it('"kickoff in 25 minutes" goes out when Thursday night\'s countdown enters its last half hour', () => {
    const { shown } = stubNotification('granted');
    saveAlertsEnabled(true);
    const view = render(tree(ctx('2026-10-22T18:44'))); // kickoff 7:15 pm is 31 minutes away: not yet
    expect(shown).toEqual([]);
    view.rerender(tree(ctx('2026-10-22T18:50')));
    expect(shown.map((s) => s.title)).toEqual(['kickoff in 25 minutes']);
  });

  it('sends nothing when alerts are off, permission is not granted, or the clock is a preview', () => {
    const c = ctx('2026-10-21T01:00');
    const off = stubNotification('granted');
    render(tree(c));
    expect(off.shown).toEqual([]);
    cleanup();

    saveAlertsEnabled(true);
    const noPermission = stubNotification('default');
    render(tree(c));
    expect(noPermission.shown).toEqual([]);
    cleanup();

    const preview = stubNotification('granted');
    render(tree(c, true));
    expect(preview.shown).toEqual([]);
    cleanup();

    vi.stubGlobal('Notification', undefined);
    expect(() => render(tree(c))).not.toThrow();
  });

  it('turning alerts off stops them', () => {
    const { shown } = stubNotification('granted');
    saveAlertsEnabled(true);
    const view = render(tree(ctx('2026-10-21T01:00')));
    expect(shown).toHaveLength(1);
    saveAlertsEnabled(false);
    view.rerender(tree(ctx('2026-10-22T18:50')));
    expect(shown).toHaveLength(1);
  });
});
