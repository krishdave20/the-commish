/* What each activity shows: the pill's compact body, the expanded card's centre, and the header of the card. The frame around them (the pill, the
   card, the dots, the action) is in LiveActivity.tsx. Everything here reads an `Activity` (engine/moments/activity.ts) and the clock. */
import type { ReactNode } from 'react';
import { Avatar, AvatarStack } from '../Avatar';
import { activityTitle, compactText, ordinal, pts1, scoreLine, whenWords } from '../../engine/moments';
import type { Activity, DraftData, KickoffData, MatchupData, PlayerRef, RecapData, SideData, WaiversData } from '../../engine/moments';
import { ActivityIcon } from './icons';
import { agoText, bigParts } from './labels';

type Of<K extends Activity['kind']> = Extract<Activity, { kind: K }>;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function Big({ a, now, tz }: { a: Activity; now: number; tz: string }) {
  const b = bigParts(a, now, tz);
  if (!b) return null;
  return <p className="la-big"><b className="la-clock">{b.clock}</b> <span className="la-cap">{b.cap}</span></p>;
}

const refs = (list: PlayerRef[]) => list.map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.team }));

/* ---------- the header of the open card ---------- */

export function CardHeader({ a }: { a: Activity }) {
  return (
    <>
      <span className="la-ico" data-live={a.moment.live ? 'true' : undefined}><ActivityIcon kind={a.kind} /></span>
      <span className="la-title">{activityTitle(a)}</span>
    </>
  );
}

/* ---------- compact: the pill ---------- */

export function Compact({ a, now, flash }: { a: Activity; now: number; flash: string | null }) {
  const text = compactText(a, now);
  if (a.kind === 'matchup' && a.data) {
    const d = a.data;
    return (
      <>
        <Avatar pid={`team:${d.me.name}`} name={d.me.name} size={28} />
        <span className="la-text la-scores">
          <span className="sr-only">{d.me.name} </span>
          <b className="la-n">{pts1(d.me.score)}</b>
          <span className="la-sep"> · </span>
          <b className="la-n la-n-opp">{pts1(d.opp.score)}</b>
          <span className="la-sep"> · </span>
          <span className="la-pct" data-side={d.winP >= 0.5 ? 'ahead' : 'behind'}>{pct(d.winP)}</span>
        </span>
        {flash && <span className="la-flash">{flash}</span>}
        <span className="la-prog" aria-hidden="true"><i style={{ width: `${Math.round(d.progress * 100)}%` }} /></span>
      </>
    );
  }
  const bar = a.moment.pill?.bar;
  return (
    <>
      <span className="la-ico" data-live={a.moment.live ? 'true' : undefined}><ActivityIcon kind={a.kind} /></span>
      <span className="la-text">{text}</span>
      {bar !== undefined && <span className="la-bar" aria-hidden="true"><i style={{ width: `${Math.round(bar * 100)}%` }} /></span>}
    </>
  );
}

/* ---------- expanded: the centre of the card ---------- */

function Side({ side, you }: { side: SideData; you?: boolean }) {
  return (
    <div className="la-side" data-you={you ? 'true' : undefined}>
      <div className="la-sidehead">
        <AvatarStack players={refs(side.stack)} size={28} />
        <span className="la-name">{side.name}</span>
      </div>
      <p className="la-score">{pts1(side.score)}</p>
      <p className="la-proj">projected {pts1(side.projected)}</p>
    </div>
  );
}

function MatchupBody({ a, now }: { a: Of<'matchup'>; now: number }) {
  const d: MatchupData | null = a.data;
  if (!d) return <Fallback a={a} now={now} />;
  return (
    <div className="la-body">
      <div className="la-sides">
        <Side side={d.me} you />
        <Side side={d.opp} />
      </div>
      <div className="la-meter" role="img" aria-label={`${pct(d.winP)} to win`}><i style={{ width: `${Math.round(d.winP * 100)}%` }} /></div>
      <p className="la-sub">
        {d.final ? `final · ${pct(d.winP)}` : `${pct(d.winP)} to win`} · {d.counts.yet} yet to play · {d.counts.live} live · {d.counts.done} done
      </p>
      {d.nowPlaying.length > 0 && (
        <ul className="la-now" aria-label="your players on the field">
          {d.nowPlaying.map((p) => (
            <li key={p.pid} data-on={p.onField === true ? 'true' : undefined} title={p.line}>
              <i className="la-nowdot" aria-hidden="true" />
              <span className="la-nowline">{p.lead}</span>
              {p.clock && <span className="la-nowclock"> · {p.clock}</span>}
              <b className="la-pts">{pts1(p.points)}</b>
            </li>
          ))}
        </ul>
      )}
      {d.lastPlay && (
        <p className="la-last">
          <b>+{pts1(d.lastPlay.delta)}</b> · {d.lastPlay.name}{agoText(now, d.lastPlay.at) ? ` · ${agoText(now, d.lastPlay.at)}` : ''}
        </p>
      )}
    </div>
  );
}

function KickoffBody({ a, now, tz }: { a: Of<'kickoff'>; now: number; tz: string }) {
  const d: KickoffData | null = a.data;
  if (!d) return <Fallback a={a} now={now} tz={tz} />;
  return (
    <div className="la-body">
      <Big a={a} now={now} tz={tz} />
      {(d.game || a.moment.label === 'inactives') && (
        <p className="la-line">{a.moment.label === 'inactives' ? `first kickoff ${whenWords(now, d.at, tz)}` : d.game}{a.moment.label === 'inactives' && d.game ? ` · ${d.game}` : ''}</p>
      )}
      {d.startersTotal > 0 && (
        <div className="la-row">
          {d.playing.length > 0 && <AvatarStack players={refs(d.playing)} size={28} max={4} />}
          <p className="la-line">
            {d.playing.length === 0 ? `none of your ${d.startersTotal} starters play then` : `${d.playing.length} of your ${d.startersTotal} starters play: ${d.playing.slice(0, 3).map((p) => p.name).join(', ')}${d.playing.length > 3 ? ` and ${d.playing.length - 3} more` : ''}`}
          </p>
        </div>
      )}
      {d.flags.length > 0 && (
        <ul className="la-flags" aria-label="starters to check">
          {d.flags.slice(0, 2).map((f) => <li key={f.pid}><b>{f.name}</b>: {f.status}</li>)}
          {d.flags.length > 2 && <li>and {d.flags.length - 2} more</li>}
        </ul>
      )}
    </div>
  );
}

function WaiversBody({ a, now, tz }: { a: Of<'waivers'>; now: number; tz: string }) {
  const d: WaiversData = a.data;
  return (
    <div className="la-body">
      <Big a={a} now={now} tz={tz} />
      {d.adds.length > 0 ? (
        <ul className="la-adds" aria-label="your top adds">
          {d.adds.map((p) => (
            <li key={p.pid}>
              <Avatar pid={p.pid} name={p.name} pos={p.pos} size={28} />
              <span className="la-addname">{p.name} <span className="la-dim">{p.pos.toLowerCase()}</span></span>
              <span className="la-addnum">+{pts1(p.gain)} lineup lift{d.faab ? ` · bid ${money(p.bid)}` : ''}</span>
            </li>
          ))}
        </ul>
      ) : <p className="la-line la-dim">{a.moment.detail}</p>}
      {d.faab && d.faabLeft !== null && <p className="la-line">faab left {money(d.faabLeft)}</p>}
    </div>
  );
}

function DraftBody({ a, now, tz }: { a: Of<'draft'>; now: number; tz: string }) {
  const d: DraftData = a.data;
  if (d.mode === 'countdown') {
    return (
      <div className="la-body">
        <Big a={a} now={now} tz={tz} />
        <p className="la-line">{d.startsAt ? whenWords(now, d.startsAt, tz) : a.moment.title}{d.mySlot !== null && d.teams !== null ? ` · you pick ${ordinal(d.mySlot)} of ${d.teams}` : ''}</p>
      </div>
    );
  }
  const info = d.info;
  const lead = d.picksUntil === 0 ? 'you’re on the clock' : d.picksUntil !== null ? `${d.picksUntil} ${d.picksUntil === 1 ? 'pick' : 'picks'} until your turn` : a.moment.title;
  const needs = info ? [...new Set(info.needs)] : [];
  const counts = (s: string) => info!.needs.filter((x) => x === s).length;
  return (
    <div className="la-body">
      <p className="la-big"><b className="la-clock">{lead}</b>{info?.nextPick && d.picksUntil !== 0 ? <span className="la-cap"> · your pick is #{info.nextPick}</span> : null}</p>
      {info && info.best.length > 0 && (
        <ol className="la-adds" aria-label="best available by value">
          {info.best.map((p) => (
            <li key={p.pid}>
              <Avatar pid={p.pid} name={p.name} pos={p.pos} team={p.team ?? undefined} size={28} />
              <span className="la-addname">{p.name} <span className="la-dim">{p.pos.toLowerCase()} · tier {p.tier}</span></span>
              <span className="la-addnum">vor {pts1(p.vor)}</span>
            </li>
          ))}
        </ol>
      )}
      {info && <p className="la-line">{needs.length ? `needs: ${needs.map((s) => (counts(s) > 1 ? `${s} ×${counts(s)}` : s)).join(', ')}` : 'every starting slot is filled'}</p>}
      {info?.last && <p className="la-line la-dim">last pick: #{info.last.pickNo} {info.last.name}{info.last.pos ? ` (${info.last.pos.toLowerCase()})` : ''} · {info.last.by}</p>}
      {!info && <p className="la-line la-dim">{a.moment.detail}</p>}
    </div>
  );
}

function RecapBody({ a, now }: { a: Of<'recap'>; now: number }) {
  const d: RecapData | null = a.data;
  if (!d) return <Fallback a={a} now={now} />;
  const word = d.verdict === 'W' ? 'you won' : d.verdict === 'L' ? 'you lost' : 'you tied';
  return (
    <div className="la-body">
      <p className="la-big"><b className="la-clock" data-verdict={d.verdict}>{scoreLine(d.mine, d.theirs)}</b> <span className="la-cap">{word}{d.week !== null ? ` · week ${d.week}` : ''}</span></p>
      <p className="la-line">against {d.oppName}</p>
      {d.top && <p className="la-line">top scorer: <b>{d.top.name}</b> {pts1(d.top.pts)}</p>}
      {d.odds && <p className="la-line">playoff odds {pct(d.odds.from)} → {pct(d.odds.to)}</p>}
    </div>
  );
}

/** Nothing but the moment's own words: its title, detail and countdown. */
function Fallback({ a, now, tz = 'UTC' }: { a: Activity; now: number; tz?: string }) {
  return (
    <div className="la-body">
      <p className="la-title-line">{a.moment.title}</p>
      <p className="la-detail">{a.moment.detail}</p>
      <Big a={a} now={now} tz={tz} />
    </div>
  );
}

export function Expanded({ a, now, tz }: { a: Activity; now: number; tz: string }): ReactNode {
  switch (a.kind) {
    case 'matchup': return <MatchupBody a={a} now={now} />;
    case 'kickoff': return <KickoffBody a={a} now={now} tz={tz} />;
    case 'waivers': return <WaiversBody a={a} now={now} tz={tz} />;
    case 'draft': return <DraftBody a={a} now={now} tz={tz} />;
    case 'recap': return <RecapBody a={a} now={now} />;
    default: return <Fallback a={a} now={now} tz={tz} />;
  }
}

