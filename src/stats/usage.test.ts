import { describe, expect, it } from 'vitest';
import {
  adot, airYardsShare, boxBucket, catchRate, contestedCatchRate, dropRate, hasSample, isEndZoneTarget, isInside10, isRedZone,
  rushShare, share, snapShare, targetShare, targetsPerRouteRun, targetsPerSnap, wopr, yardsPerCarry, yardsPerRouteRun, yardsPerTarget,
} from './usage.ts';
import { ratio, round } from './ratio.ts';

describe('ratio and round', () => {
  it('rounds and guards the denominator', () => {
    expect(round(2.345, 2)).toBe(2.35);
    expect(round(-1.2345, 3)).toBe(-1.235);
    expect(ratio(1, 3)).toBe(0.333);
    expect(ratio(2, 3, 2)).toBe(0.67);
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, null)).toBeNull();
    expect(ratio(5, undefined)).toBeNull();
    expect(ratio(5, Number.NaN)).toBeNull();
    expect(ratio(Number.NaN, 5)).toBeNull();
    expect(ratio(0, 5)).toBe(0);
  });
});

describe('shares (hand-computed)', () => {
  it('snap share', () => {
    expect(snapShare(45, 60)).toBe(0.75);
    expect(snapShare(41, 63)).toBe(0.651);
    expect(snapShare(0, 60)).toBe(0);
    expect(snapShare(10, 0)).toBeNull();
  });
  it('target share = targets / team pass attempts', () => {
    expect(targetShare(9, 36)).toBe(0.25);
    expect(targetShare(7, 30)).toBe(0.233);
    expect(targetShare(7, 0)).toBeNull();
  });
  it('air-yards share', () => {
    expect(airYardsShare(120, 300)).toBe(0.4);
    expect(airYardsShare(-4, 200)).toBe(-0.02);
    expect(airYardsShare(50, 0)).toBeNull();
  });
  it('aDOT = air yards per target', () => {
    expect(adot(96, 8)).toBe(12);
    expect(adot(100, 7)).toBe(14.29);
    expect(adot(0, 5)).toBe(0);
    expect(adot(40, 0)).toBeNull();
  });
  it('WOPR = 1.5 * target share + 0.7 * air-yards share', () => {
    // 1.5 * 0.25 + 0.7 * 0.4 = 0.375 + 0.28 = 0.655
    expect(wopr(0.25, 0.4)).toBe(0.655);
    // 1.5 * 0.3 + 0.7 * 0.1 = 0.52
    expect(wopr(0.3, 0.1)).toBe(0.52);
    expect(wopr(0, 0)).toBe(0);
    expect(wopr(null, 0.4)).toBeNull();
    expect(wopr(0.25, null)).toBeNull();
  });
  it('rush share', () => {
    expect(rushShare(18, 27)).toBe(0.667);
    expect(rushShare(3, 0)).toBeNull();
  });
  it('red-zone / inside-10 / end-zone tests', () => {
    expect(isRedZone(20)).toBe(true);
    expect(isRedZone(21)).toBe(false);
    expect(isRedZone(null)).toBe(false);
    expect(isInside10(10)).toBe(true);
    expect(isInside10(11)).toBe(false);
    // 8 yards out, 8 air yards: the catch spot is the goal line
    expect(isEndZoneTarget(8, 8)).toBe(true);
    expect(isEndZoneTarget(8, 9)).toBe(true);
    expect(isEndZoneTarget(8, 7)).toBe(false);
    expect(isEndZoneTarget(8, null)).toBe(false);
    expect(isEndZoneTarget(null, 3)).toBe(false);
  });
});

describe('efficiency (hand-computed)', () => {
  it('yards per target and per carry', () => {
    expect(yardsPerTarget(75, 10)).toBe(7.5);
    expect(yardsPerTarget(50, 7)).toBe(7.14);
    expect(yardsPerTarget(0, 0)).toBeNull();
    expect(yardsPerCarry(92, 20)).toBe(4.6);
    expect(yardsPerCarry(10, 0)).toBeNull();
  });
  it('catch rate and drop rate are over catchable targets', () => {
    expect(catchRate(6, 8)).toBe(0.75);
    expect(dropRate(1, 8)).toBe(0.125);
    expect(catchRate(0, 0)).toBeNull();
    expect(dropRate(0, 0)).toBeNull();
    expect(contestedCatchRate(2, 5)).toBe(0.4);
    expect(contestedCatchRate(0, 0)).toBeNull();
  });
  it('targets per snap proxy, route stats and generic share', () => {
    expect(targetsPerSnap(6, 40)).toBe(0.15);
    expect(targetsPerSnap(6, 0)).toBeNull();
    expect(yardsPerRouteRun(84, 42)).toBe(2);
    expect(yardsPerRouteRun(31, 29)).toBe(1.07);
    expect(targetsPerRouteRun(9, 36)).toBe(0.25);
    expect(yardsPerRouteRun(5, 0)).toBeNull();
    expect(targetsPerRouteRun(5, 0)).toBeNull();
    expect(share(3, 12)).toBe(0.25);
    expect(share(3, 0)).toBeNull();
  });
});

describe('box buckets and the sample gate', () => {
  it('8+ stacked, 6 or fewer light, 7 neutral, 0 or missing unknown', () => {
    expect(boxBucket(8)).toBe('stacked');
    expect(boxBucket(11)).toBe('stacked');
    expect(boxBucket(7)).toBe('neutral');
    expect(boxBucket(6)).toBe('light');
    expect(boxBucket(1)).toBe('light');
    expect(boxBucket(0)).toBe('unknown');
    expect(boxBucket(null)).toBe('unknown');
  });
  it('hasSample compares with the minimum, inclusive', () => {
    expect(hasSample(15, 15)).toBe(true);
    expect(hasSample(14, 15)).toBe(false);
  });
});
