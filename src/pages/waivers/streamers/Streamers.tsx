import { useMemo, useState } from 'react';
import { useScenario } from '../../../app/modelContext';
import { formatPoints1, signed } from '../../../app/format';
import { useComputed } from '../../../app/useComputed';
import { useDebounced } from '../../../app/useSimulation';
import { Goalposts } from '../../../components/art/Goalposts';
import { HeadlineStrip } from '../../../components/HeadlineStrip';
import { MoreColumns } from '../../../components/MoreColumns';
import { SectionHeader } from '../../../components/SectionHeader';
import { Segmented } from '../../../components/Segmented';
import { usePhone } from '../../../components/useMediaQuery';
import { useMoreColumns } from '../../../components/useMoreColumns';
import type { Engine, ModelPlayer } from '../../../engine';
import { streamers } from '../../../engine/streaming';
import type { StreamCard, StreamRow } from '../../../engine/streaming';
import { StreamTable } from './StreamTable';
import { useTryStreamer } from './useTryStreamer';
import './streamers.css';

type Pick = 'next' | 'after';

const fillText = (c: StreamCard): string => {
  const f = c.fill!;
  return f.reason === 'bye' ? `bye week fill for ${f.for.name}` : `fill for ${f.for.name}, who is out`;
};

/** Free agents worth streaming this week (or next), per position, scored against your lineup. */
export function Streamers({ engine }: { engine: Engine }) {
  const { scenario } = useScenario();
  const settled = useDebounced(scenario, 250);
  const [pick, setPick] = useState<Pick>('next');
  const more = useMoreColumns('streamers');
  const phone = usePhone();
  const tryIt = useTryStreamer();
  const { model } = engine;
  const cur = model.meta.currentWeek;
  const week = pick === 'next' ? cur + 1 : cur + 2;

  const board = useMemo(() => streamers(model, { week, scenario: settled, meRid: engine.meRid }), [model, week, settled, engine.meRid]);
  // the waiver board's bid for a player on it (next-week window); the rest get the small "$0–1 stream" note
  const wireBoard = useComputed(() => engine.waivers(settled, 'next'), [engine, settled]);
  const wire = useMemo(() => {
    const out = new Map<string, { bid: number; drop: ModelPlayer }>();
    for (const w of wireBoard.value?.list ?? []) out.set(w.pid, { bid: w.bid, drop: w.drop });
    return out;
  }, [wireBoard.value]);

  const { best, fills, cards } = board;
  const upgrades = cards.filter((c) => c.rows[0]?.upgrade).length;
  const weeks = board.weeks;
  const onTry = (r: StreamRow) => tryIt(r.player, wire.get(r.pid)?.drop ?? null);
  const nothing = cards.every((c) => c.rows.length === 0);
  const calm = !best && fills.length === 0;

  return (
    <>
      <HeadlineStrip label="Best stream" items={[
        {
          label: 'best stream',
          value: <span className="strip-name">{best ? best.row.player.name : '—'}</span>,
          sub: best
            ? `add · ${best.card.label} ${best.row.opp === 'BYE' ? '' : `vs ${best.row.opp}`} · ${formatPoints1(best.row.proj)} proj · ${signed(best.row.diff)} over your ${best.card.key === 'FLEX' ? 'flex' : best.card.label}`
            : 'nobody beats your starters',
        },
        {
          label: 'needs a fill',
          value: <span>{fills.length ? fills.map((c) => c.label).join(' · ') : 'none'}</span>,
          sub: fills.length ? fillText(fills[0]!) + (fills.length > 1 ? ` (+${fills.length - 1} more)` : '') : 'every starter has a game',
        },
        {
          label: 'upgrades',
          value: <span>{upgrades}</span>,
          sub: `of ${cards.length} ${cards.length === 1 ? 'position' : 'positions'} have a streamer worth a spot`,
        },
      ]} />
      <section className="card" aria-labelledby="streamers-title">
        <SectionHeader
          id="streamers-title" title="streamers"
          tip="streamers are free agents ranked by next week’s projection, which already includes the matchup; the grade shows why. “vs your starter” compares with the weakest starter he would replace in your best lineup, and an upgrade is more than 1 point better."
        />
        <div className="stream-tools">
          <Segmented
            label="Streaming week" value={pick} onChange={setPick}
            options={[{ value: 'next', label: 'next week' }, ...(weeks.length > 1 ? [{ value: 'after' as const, label: 'week after' }] : [])]}
          />
          {!nothing && !phone && <MoreColumns on={more.on} onToggle={more.toggle} label="streamers" />}
        </div>
        {calm && !nothing && (
          <div className="art-empty stream-empty">
            <Goalposts size={36} />
            <p className="take">no streamer beats your starters {pick === 'next' ? 'this week' : 'that week'}. you're set.</p>
          </div>
        )}
        {nothing ? (
          <div className="art-empty stream-empty">
            <Goalposts size={36} />
            <p className="take">{cards.length ? 'no free agent has a game and a projection that week.' : 'no streaming spots in this league’s lineup.'}</p>
          </div>
        ) : (
          <div className={more.on ? 'stream-grid wide' : 'stream-grid'}>
            {cards.map((c) => (
              <section key={c.key} className="stream-pos" aria-labelledby={`stream-${c.key}`}>
                <SectionHeader id={`stream-${c.key}`} title={c.label} level={3} />
                {c.fill && <p className="stream-fill">{fillText(c)}</p>}
                {c.rows.length === 0
                  ? <p className="note stream-note">no free {c.label} has a game and a projection that week.</p>
                  : <StreamTable card={c} more={more.on} wire={wire} onTry={onTry} />}
              </section>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
