import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Drawer } from '../../components/Drawer';
import { SectionHeader } from '../../components/SectionHeader';
import { rivalsOf } from '../../engine/almanac';
import type { Almanac, Series } from '../../engine/almanac';
import { SeriesDetail } from './SeriesDetail';
import { managerName, recordText } from './text';

const SEP = '~';

/** "Ann", or the first word of a long name: what fits above a matrix column */
const short = (name: string) => (name.length > 9 ? name.split(/\s+/)[0]!.slice(0, 9) : name);

function Cell({ s, me, you, onOpen, names }: { s: Series | null; me: string; you: string; onOpen: (a: string, b: string) => void; names: [string, string] }) {
  if (!s) return <td className="mx-none" aria-label={`${names[0]} and ${names[1]} have not met`}>·</td>;
  const lead = s.aWins > s.bWins ? 'up' : s.aWins < s.bWins ? 'down' : 'even';
  return (
    <td className="mx-cell" data-lead={lead}>
      <button
        type="button" className="mx-btn" onClick={() => onOpen(me, you)}
      >
        {/* no aria-label: the visible record is part of the name (WCAG 2.5.3); the context is hidden text around it */}
        <span className="sr-only">{names[0]} against {names[1]}:</span>{' '}
        {recordText(s.aWins, s.bWins, s.ties)}{' '}
        <span className="sr-only">({s.aWins} wins, {s.bWins} losses{s.ties ? `, ${s.ties} ties` : ''}), open the rivalry</span>
      </button>
    </td>
  );
}

function RivalCard({ title, tip, s, a, onOpen }: { title: string; tip: string; s: Series | null; a: Almanac; onOpen: (x: string, y: string) => void }) {
  return (
    <div className="rival">
      <span className="micro">{title}</span>
      {s ? (
        <button type="button" className="rival-btn" onClick={() => onOpen(s.a, s.b)}>
          <span className="rival-name">{managerName(a, s.b)}</span>
          <span className="rival-rec">{recordText(s.aWins, s.bWins, s.ties)} in {s.meetings.length} {s.meetings.length === 1 ? 'meeting' : 'meetings'}</span>
        </button>
      ) : <span className="note">{tip}</span>}
    </div>
  );
}

/** The head-to-head matrix, clickable, and "your rivals". A click (or Enter) opens the series in a drawer; the open series lives in `?vs=` so a link or the back button reaches it. */
export function Rivalries({ almanac: a, userId }: { almanac: Almanac; userId: string | null }) {
  const [params, setParams] = useSearchParams();
  const { rivalries } = a;
  // matrix order: most wins first, so the strongest managers are at the top left
  const order = useMemo(() => {
    const w = new Map(a.allTime.map((r) => [r.mgr, r.pct] as const));
    return rivalries.managers.slice().sort((x, y) => (w.get(y) ?? 0) - (w.get(x) ?? 0) || managerName(a, x).localeCompare(managerName(a, y)));
  }, [a, rivalries]);

  const vs = params.get('vs');
  const pair = vs ? vs.split(SEP) : null;
  const open = pair && pair.length === 2 ? rivalries.get(pair[0]!, pair[1]!) : null;
  const openPair = (x: string, y: string) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('vs', `${x}${SEP}${y}`); return n; }, { replace: true });
  const close = () => setParams((prev) => { const n = new URLSearchParams(prev); n.delete('vs'); return n; }, { replace: true });

  const mine = userId && order.includes(userId) ? rivalsOf(rivalries, userId) : null;
  const sparse = rivalries.all.length > 0 && rivalries.all.every((s) => s.meetings.length === 1);

  if (rivalries.all.length === 0) {
    return <p className="note">no two managers have met yet. every game this season adds to a rivalry.</p>;
  }
  return (
    <>
      {mine && (
        <section className="card" aria-labelledby="rivals-title">
          <SectionHeader id="rivals-title" title="your rivals" tip="your closest series is the one nearest to even among opponents you have met at least twice. your most-played opponent is the one you have faced the most." />
          <div className="rivals">
            <RivalCard title="closest series" tip="you need two meetings with someone to have a closest series." s={mine.closest} a={a} onOpen={openPair} />
            <RivalCard title="most played" tip="you have not played anyone yet." s={mine.mostPlayed} a={a} onOpen={openPair} />
          </div>
        </section>
      )}
      <section className="card" aria-labelledby="matrix-title">
        <SectionHeader
          id="matrix-title" title="head to head"
          tip="each cell is the row manager’s all-time record against the column manager, regular season and playoffs together. green is a winning series, red a losing one. tap a cell for every meeting."
        />
        <div className="tw mx-wrap">
          <table className="mx">
            <caption className="sr-only">Head-to-head records. Read across: the row manager’s record against each column manager.</caption>
            <thead>
              <tr>
                <th scope="col" className="mx-corner"><span className="sr-only">manager</span></th>
                {order.map((id) => <th key={id} scope="col" className="mx-col" title={managerName(a, id)}><span aria-hidden="true">{short(managerName(a, id))}</span><span className="sr-only">{managerName(a, id)}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {order.map((row) => (
                <tr key={row} className={row === userId ? 'me' : undefined}>
                  <th scope="row" className="mx-row">{managerName(a, row)}{row === userId && <span className="you">you</span>}</th>
                  {order.map((col) => row === col
                    ? <td key={col} className="mx-self" aria-hidden="true">—</td>
                    : <Cell key={col} s={rivalries.get(row, col)} me={row} you={col} onOpen={openPair} names={[managerName(a, row), managerName(a, col)]} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sparse && <p className="note">most pairs have met once so far. the series fill in as the seasons add up.</p>}
      </section>
      <Drawer
        open={!!open} onClose={close}
        title={open ? `${managerName(a, open.a)} vs ${managerName(a, open.b)}` : 'rivalry'}
        kicker={open ? `rivalry · ${open.meetings.length} ${open.meetings.length === 1 ? 'meeting' : 'meetings'}` : undefined}
      >
        {open && <SeriesDetail almanac={a} series={open} />}
      </Drawer>
    </>
  );
}
