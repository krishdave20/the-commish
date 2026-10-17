// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { adpField, adpFieldFor, inferDraftMode, isTwoQb, readAdp, scoringKind } from './adp.ts';
import { leagueOf, STD_SLOTS } from './test-helpers.ts';

const SF = [...STD_SLOTS.slice(0, 5), 'SUPER_FLEX', ...STD_SLOTS.slice(5)];
const TWO_QB = ['QB', 'QB', ...STD_SLOTS.slice(1)];

describe('ADP field selection', () => {
  it('redraft: ppr / half / std by rec', () => {
    expect(adpField(leagueOf({ rec: 1 }))).toBe('adp_ppr');
    expect(adpField(leagueOf({ rec: 0.5 }))).toBe('adp_half_ppr');
    expect(adpField(leagueOf({ rec: 0 }))).toBe('adp_std');
    expect(adpField(leagueOf({ rec: 0.75 }))).toBe('adp_ppr');
    expect(adpField(leagueOf({ rec: 0.25 }))).toBe('adp_half_ppr');
    expect(adpField(leagueOf({ rec: 0.24 }))).toBe('adp_std');
    expect(scoringKind({})).toBe('ppr');
  });
  it('2 QB / superflex: adp_2qb (redraft) and adp_dynasty_2qb (dynasty)', () => {
    expect(adpField(leagueOf({ slots: SF }))).toBe('adp_2qb');
    expect(adpField(leagueOf({ slots: TWO_QB, rec: 0 }))).toBe('adp_2qb');
    expect(adpField(leagueOf({ slots: SF, type: 2 }))).toBe('adp_dynasty_2qb');
    expect(isTwoQb(SF)).toBe(true);
    expect(isTwoQb(TWO_QB)).toBe(true);
    expect(isTwoQb(STD_SLOTS)).toBe(false);
  });
  it('dynasty (type 2): adp_dynasty_ppr / _half_ppr / _std', () => {
    expect(adpField(leagueOf({ type: 2, rec: 1 }))).toBe('adp_dynasty_ppr');
    expect(adpField(leagueOf({ type: 2, rec: 0.5 }))).toBe('adp_dynasty_half_ppr');
    expect(adpField(leagueOf({ type: 2, rec: 0 }))).toBe('adp_dynasty_std');
  });
  it('rookie drafts use adp_rookie whatever the format', () => {
    for (const l of [leagueOf(), leagueOf({ type: 2 }), leagueOf({ type: 2, slots: SF, rec: 0 })]) expect(adpField(l, 'rookie')).toBe('adp_rookie');
  });
  it('keeper leagues (type 1) read the redraft columns', () => {
    expect(adpField(leagueOf({ type: 1 }))).toBe('adp_ppr');
  });
  it('mode is inferred from the league and the draft', () => {
    expect(inferDraftMode(leagueOf())).toBe('redraft');
    expect(inferDraftMode(leagueOf({ type: 2 }))).toBe('startup');
    expect(inferDraftMode(leagueOf({ type: 2 }), { settings: { player_type: 1 } })).toBe('rookie');
    expect(inferDraftMode(leagueOf({ type: 2 }), { settings: { player_type: 0 } })).toBe('startup');
    expect(adpField(leagueOf({ type: 2 }))).toBe('adp_dynasty_ppr');
  });
  it('IDP positions use the IDP columns (1QB vs 2QB), except in rookie drafts', () => {
    expect(adpFieldFor('LB', leagueOf())).toBe('adp_idp_1qb');
    expect(adpFieldFor('DL', leagueOf({ slots: SF }))).toBe('adp_idp');
    expect(adpFieldFor('LB', leagueOf(), 'rookie')).toBe('adp_rookie');
    expect(adpFieldFor('WR', leagueOf())).toBe('adp_ppr');
  });
});

describe('readAdp', () => {
  it('returns the value, and null for 999, absent, zero or non-numeric', () => {
    expect(readAdp({ adp_ppr: 12.5 }, 'adp_ppr')).toBe(12.5);
    expect(readAdp({ adp_ppr: 999 }, 'adp_ppr')).toBeNull();
    expect(readAdp({ adp_ppr: 998.9 }, 'adp_ppr')).toBe(998.9);
    expect(readAdp({}, 'adp_ppr')).toBeNull();
    expect(readAdp({ adp_ppr: 0 }, 'adp_ppr')).toBeNull();
    expect(readAdp({ adp_ppr: NaN }, 'adp_ppr')).toBeNull();
    expect(readAdp(undefined, 'adp_ppr')).toBeNull();
    expect(readAdp({ adp_ppr: 999, adp_std: 40 }, 'adp_ppr', 'adp_std')).toBe(40);
  });
});

describe('the draft mode wins over the league type', () => {
  it('startup reads the dynasty columns even in a redraft or keeper league', () => {
    expect(adpField(leagueOf({ rec: 1 }), 'startup')).toBe('adp_dynasty_ppr');
    expect(adpField(leagueOf({ type: 1, rec: 0.5 }), 'startup')).toBe('adp_dynasty_half_ppr');
    expect(adpField(leagueOf({ slots: SF, rec: 0 }), 'startup')).toBe('adp_dynasty_2qb');
    expect(adpFieldFor('WR', leagueOf(), 'startup')).toBe('adp_dynasty_ppr');
  });
  it('rookie is adp_rookie and an explicit redraft draft reads redraft columns, whatever the league type', () => {
    expect(adpField(leagueOf(), 'rookie')).toBe('adp_rookie');
    expect(adpField(leagueOf({ type: 2 }), 'redraft')).toBe('adp_ppr');
  });
});
