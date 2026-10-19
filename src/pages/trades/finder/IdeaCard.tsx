import { AvatarStack } from '../../../components/Avatar';
import { PlayerLink } from '../../../components/PlayerLink';
import { formatOdds, signed, signedPct } from '../../../app/format';
import { prefillFor, type FinderIdea, type FinderPlayer, type FinderSide, type Prefill } from '../../../engine/tradefinder/index.ts';
import { KIND_LABEL } from './labels';
import type { OddsChange } from './useFinder';

const stack = (ps: readonly FinderPlayer[]) => ps.map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.nfl ?? undefined }));

function Names({ players }: { players: readonly FinderPlayer[] }) {
  return (
    <span>
      {players.map((p, i) => (
        <span key={p.pid}>{i > 0 && ' + '}<span className="dim">{p.pos.toLowerCase()} </span><PlayerLink pid={p.pid} name={p.name} /></span>
      ))}
    </span>
  );
}

function Pair({ label, players }: { label: string; players: readonly FinderPlayer[] }) {
  return (
    <div className="fside">
      <span className="micro">{label}</span>
      <span className="fside-row"><AvatarStack players={stack(players)} size={28} max={3} /><Names players={players} /></span>
    </div>
  );
}

/** Three legs of a rotation: who sends whom to whom. */
function Legs({ sides }: { sides: readonly FinderSide[] }) {
  return (
    <ol className="flegs" aria-label="who sends whom">
      {sides.map((s, i) => {
        const to = sides[(i + 1) % sides.length]!;
        return (
          <li key={s.rid}>
            <span className="fside-row">
              <AvatarStack players={stack(s.send)} size={28} max={1} />
              <span><Names players={s.send} /><span className="dim">, {s.isMe ? 'you' : s.team} → {to.isMe ? 'you' : to.team}</span></span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const pts = (x: number) => signed(x);

function Gains({ idea }: { idea: FinderIdea }) {
  return (
    <ul className="fgains" aria-label="lineup gain for each side">
      {idea.sides.map((s) => (
        <li key={s.rid}>
          <span className="dim">{s.isMe ? 'you' : s.team}</span>{' '}
          <span className={s.gain >= 0 ? 'pos-c' : 'neg-c'}>{pts(s.gain)}</span>
          <span className="dim"> pts ({pts(s.perWeek)} a week)</span>
        </li>
      ))}
    </ul>
  );
}

function Drops({ idea }: { idea: FinderIdea }) {
  const drops = idea.sides.filter((s) => s.drop);
  if (drops.length === 0) return null;
  return (
    <p className="note fdrops">
      {drops.map((s, i) => (
        <span key={s.rid}>{i > 0 && ' · '}{s.isMe ? 'you drop' : `${s.team} drops`} <PlayerLink pid={s.drop!.pid} name={s.drop!.name} /> <span className="dim">(roster limit, bench)</span></span>
      ))}
    </p>
  );
}

interface Props {
  idea: FinderIdea;
  /** your playoff odds change: undefined = not simulated (not in the top few), null = simulating */
  odds: OddsChange | null | undefined;
  onLoad: (p: Prefill) => void;
}

/** One idea: who goes where, the sentence, each side's gain, and "load in analyzer". */
export function IdeaCard({ idea, odds, onLoad }: Props) {
  const me = idea.sides[0]!;
  const partner = idea.kind === 'three-team' ? idea.sides.slice(1).map((s) => s.team).join(' and ') : idea.sides[1]!.team;
  const pre = prefillFor(idea);
  const lead = me.get.map((p) => p.name).join(' + ');
  return (
    <li className="fcard" aria-label={`${KIND_LABEL[idea.kind]} with ${partner}: ${lead}`}>
      <div className="fcard-head">
        <span className="chip flat">{KIND_LABEL[idea.kind]}</span>
        <span className="fcard-with">with {partner}</span>
        {idea.lopsided && (
          <span className="chip gold" title="more than 15% apart on FantasyCalc value">
            lopsided {Math.round(Math.max(...idea.sides.map((s) => s.value?.gap ?? 0)) * 100)}% apart
          </span>
        )}
        {odds !== undefined && (
          <span className="fcard-odds dim" aria-live="polite">
            {odds ? <>your playoff odds {formatOdds(odds.before)} → <span className={odds.after >= odds.before ? 'pos-c' : 'neg-c'}>{formatOdds(odds.after)} ({signedPct(odds.after - odds.before)})</span></> : 'playoff odds: simulating…'}
          </span>
        )}
      </div>
      {idea.kind === 'three-team' ? (
        <Legs sides={idea.sides} />
      ) : (
        <div className="ftrade">
          <Pair label="you send" players={me.send} />
          <span className="farrow" aria-hidden="true">⇄</span>
          <Pair label="you get" players={me.get} />
        </div>
      )}
      <p className="take">{idea.text}</p>
      <Gains idea={idea} />
      <Drops idea={idea} />
      <div className="row">
        <button type="button" className="btn" onClick={() => onLoad(pre)} aria-label={`Load in analyzer: ${me.send.map((p) => p.name).join(' + ')} for ${lead}${pre.partial ? ' (your leg only)' : ''}`}>
          load in analyzer
        </button>
        {pre.partial && <span className="note">loads your leg only: the analyzer holds two teams</span>}
      </div>
    </li>
  );
}
