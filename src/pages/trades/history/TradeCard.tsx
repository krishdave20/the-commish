import { AvatarStack } from '../../../components/Avatar';
import { PlayerLink } from '../../../components/PlayerLink';
import { formatOdds, ordinal, signed, signedPct } from '../../../app/format';
import type { PickMove, PlayerRef, TradeGrade, TradeSideGrade } from '../../../engine/tradefinder/index.ts';
import type { SideOdds } from './useTrades';

const stack = (ps: readonly PlayerRef[]) => ps.map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.nfl ?? undefined }));
const day = (at: number) => (at > 0 ? new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const tone = (g: string) => (g.startsWith('A') || g.startsWith('B') ? 'pos-c' : g.startsWith('C') ? '' : 'neg-c');
const pickText = (p: PickMove) => `${p.season} ${ordinal(p.round)}`;

function Names({ players }: { players: readonly PlayerRef[] }) {
  if (players.length === 0) return <span className="dim">nothing</span>;
  return (
    <span>
      {players.map((p, i) => (
        <span key={p.pid}>{i > 0 && ', '}<span className="dim">{p.pos.toLowerCase()} </span>{/^\d+$/.test(p.pid) && !p.name.startsWith('player ') ? <PlayerLink pid={p.pid} name={p.name} /> : p.name}</span>
      ))}
    </span>
  );
}

function Side({ s, winner, odds, pending }: { s: TradeSideGrade; winner: boolean; odds: SideOdds | undefined; pending: boolean }) {
  return (
    <div className="tside" data-winner={winner || undefined}>
      <div className="tside-head">
        <span className={`tgrade ${tone(s.grade)}`} aria-label={`grade ${s.grade}`}>{s.grade}</span>
        <span className="tside-team">{s.team}{s.isMe && <span className="chip gold"> you</span>}{winner && <span className="chip up"> winner</span>}</span>
      </div>
      <p className="tline"><span className="micro">got</span> <AvatarStack players={stack(s.got)} size={20} max={3} /> <Names players={s.got} /></p>
      <p className="tline"><span className="micro">sent</span> <Names players={s.sent} /></p>
      {(s.picksGot.length > 0 || s.picksSent.length > 0) && (
        <p className="tline note">
          picks: {s.picksGot.length > 0 && <>got {s.picksGot.map(pickText).join(', ')}</>}{s.picksGot.length > 0 && s.picksSent.length > 0 && '; '}{s.picksSent.length > 0 && <>sent {s.picksSent.map(pickText).join(', ')}</>} (not graded)
        </p>
      )}
      {s.faab !== 0 && <p className="tline note">FAAB {s.faab > 0 ? `+$${s.faab}` : `−$${-s.faab}`}</p>}
      <ul className="tnums" aria-label={`numbers for ${s.team}`}>
        <li>
          <span className="dim">lineup swing </span><span className={s.swing >= 0 ? 'pos-c' : 'neg-c'}>{signed(s.swing)}</span>
          <span className="dim"> pts ({signed(s.past)} played, {signed(s.ahead)} to come)</span>
        </li>
        {s.weeksSince > 0 && (
          <li>
            <span className="dim">scored since </span>{s.ptsGot.toFixed(1)}<span className="dim"> from what came in vs </span>{s.ptsSent.toFixed(1)}<span className="dim"> from what left, {s.weeksSince} week{s.weeksSince === 1 ? '' : 's'}</span>
          </li>
        )}
        {s.valueGot !== null && s.valueSent !== null && (
          <li><span className="dim">dynasty value now </span>{Math.round(s.valueGot).toLocaleString('en-US')}<span className="dim"> in, </span>{Math.round(s.valueSent).toLocaleString('en-US')}<span className="dim"> out</span></li>
        )}
        {odds ? (
          <li>
            <span className="dim">playoff odds today </span>{formatOdds(odds.with)}<span className="dim"> with the deal, </span>{formatOdds(odds.without)}<span className="dim"> without </span>
            <span className={odds.with >= odds.without ? 'pos-c' : 'neg-c'}>({signedPct(odds.with - odds.without)})</span>
          </li>
        ) : pending ? <li className="dim">playoff odds today: simulating…</li> : null}
        {s.unscored > 0 && <li className="note">{s.unscored} player{s.unscored === 1 ? '' : 's'} no longer in the model, so not scored</li>}
      </ul>
    </div>
  );
}

/** Words for who won, from the numbers. */
function verdict(g: TradeGrade): string {
  const weeks = g.sides[0]?.weeks ?? 0;
  if (!g.decisive) return `close to even: the sides are ${Math.abs(g.margin).toFixed(1)} lineup points apart over ${weeks} weeks.`;
  const win = g.sides.find((s) => s.rid === g.winner)!;
  const lose = [...g.sides].sort((a, b) => a.swing - b.swing)[0]!;
  return `${win.team} won this one: ${signed(win.swing)} lineup points against ${signed(lose.swing)} for ${lose.team}, a ${g.margin.toFixed(1)} point gap over ${weeks} weeks.`;
}

interface Props {
  g: TradeGrade;
  odds: Record<number, SideOdds> | undefined;
  oddsPending: boolean;
}

/** One real trade: the week and labels, who won, and each side's grade with the players, swing, points since and odds. */
export function TradeCard({ g, odds, oddsPending }: Props) {
  return (
    <li className="tcard" aria-label={`week ${g.trade.week} trade between ${g.sides.map((s) => s.team).join(' and ')}`}>
      <div className="tcard-head">
        <span className="tweek">week {g.trade.week}</span>
        {day(g.trade.at) && <span className="micro">{day(g.trade.at)}</span>}
        {g.labels.map((l) => <span key={l.kind} className="chip gold" title={l.text}>{l.kind === 'fleece of the week' ? `${l.kind} ${g.trade.week}` : l.kind}</span>)}
      </div>
      <p className="take">{verdict(g)}</p>
      <div className="tsides">
        {g.sides.map((s) => <Side key={s.rid} s={s} winner={g.winner === s.rid} odds={odds?.[s.rid]} pending={oddsPending} />)}
      </div>
    </li>
  );
}
