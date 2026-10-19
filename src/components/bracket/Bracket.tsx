import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { formatOdds, formatPoints1 } from '../../app/format';
import {
  championOf, matchupOf, oddsFor, playOnce, prunePicks, resolveBracket, scoringFor,
  type Bracket as BracketData, type BracketCtx, type BracketPicks, type ResolvedMatch,
} from '../../engine';
import { Uprights } from '../art/Uprights';
import { OddsCell } from '../OddsCell';
import { ShareButton, bracketCard } from '../share';
import { useReducedMotion } from '../motion';
import { TOUCH_QUERY, useMediaQuery } from '../useMediaQuery';
import { copyFor, roundLabel, weeksLabel } from './copy';
import { CHAMP_H, COL_W, DEFAULT_DIMS, GAP_W, HEAD_H, TOUCH_DIMS, layoutBracket } from './layout';

interface Props {
  bracket: BracketData;
  ctx: BracketCtx;
  names: ReadonlyMap<number, string>;
  /** the signed-in team's roster id (highlighted) */
  meRid: number;
  /** a line under the controls, e.g. where the bracket came from */
  caption?: string;
  /** hide the odds table under the bracket */
  compact?: boolean;
  /** how long each round shows while "sim it" plays (ms; default 550) */
  stepMs?: number;
}

interface SimRun { picks: BracketPicks; shown: number }

const nameOf = (names: ReadonlyMap<number, string>, rid: number) => names.get(rid) ?? `team ${rid}`;

/** A single-elimination bracket, left to right, that you can play with. Click a team to advance it (in a toilet bowl: click the team
    that gets flushed, because the loser advances); click again to undo. Title (or flush) odds are exact and update with every pick.
    "sim it" plays one seeded random run, round by round. Real results are locked. */
export function Bracket({ bracket, ctx, names, meRid, caption, compact = false, stepMs = 550 }: Props) {
  const copy = copyFor(bracket.kind);
  const toilet = bracket.kind === 'toilet';
  const reduced = useReducedMotion();
  const touch = useMediaQuery(TOUCH_QUERY);
  const { slotH: SLOT_H, matchH: MATCH_H } = touch ? TOUCH_DIMS : DEFAULT_DIMS;
  const uid = useId();
  const [picks, setPicks] = useState<BracketPicks>({});
  const [run, setRun] = useState<SimRun | null>(null);
  const [runNo, setRunNo] = useState(0);
  const [tip, setTip] = useState<string | null>(null);
  const [say, setSay] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  const roundOf = useMemo(() => new Map(bracket.matches.map((m) => [m.id, m.round] as const)), [bracket]);
  const shown = useMemo<BracketPicks>(() => {
    if (!run) return picks;
    const out: BracketPicks = {};
    for (const [id, rid] of Object.entries(run.picks)) if ((roundOf.get(id) ?? 99) <= run.shown) out[id] = rid;
    return out;
  }, [run, picks, roundOf]);
  const effective = useMemo(() => prunePicks(bracket, shown), [bracket, shown]);
  const resolved = useMemo(() => resolveBracket(bracket, effective), [bracket, effective]);
  const layout = useMemo(() => layoutBracket(bracket, touch ? TOUCH_DIMS : DEFAULT_DIMS), [bracket, touch]);
  const odds = useMemo(() => oddsFor(bracket, ctx, effective), [bracket, ctx, effective]);
  const sc = useMemo(() => scoringFor(bracket, ctx), [bracket, ctx]);
  const champion = championOf(resolved);
  const open = resolved.filter((m) => !m.locked);
  const nPicked = resolved.filter((m) => m.picked).length;

  // "sim it": reveal one round at a time. A finished run stays as it is (its picks all show) until the next click turns it into ordinary picks.
  useEffect(() => {
    if (!run || run.shown >= bracket.rounds) return;
    const t = setTimeout(() => {
      setRun((r) => (r ? { ...r, shown: r.shown + 1 } : r));
    }, stepMs);
    return () => clearTimeout(t);
  }, [run, bracket.rounds, stepMs]);

  const stop = useCallback((): BracketPicks => {
    const visible = shown;
    if (run) { setRun(null); setPicks(visible); }
    return visible;
  }, [run, shown]);

  function choose(m: ResolvedMatch, rid: number) {
    if (m.locked || !m.ready) return;
    const base = stop();
    const next = { ...base };
    const undo = m.picked && m.advancer === rid;
    if (undo) delete next[m.id]; else next[m.id] = rid;
    const pruned = prunePicks(bracket, next);
    setPicks(pruned);
    const who = nameOf(names, rid);
    if (undo) setSay(`${who}'s pick cleared.`);
    else {
      const final = m.round === bracket.rounds;
      setSay(final ? `${who} is the ${copy.champ}.` : toilet ? `${who} gets flushed and advances to round ${m.round + 1}.` : `${who} advances to round ${m.round + 1}.`);
    }
  }

  function simIt() {
    const seed = 20261016 + runNo * 7919;
    const out = playOnce(bracket, ctx, { seed });
    setRunNo((n) => n + 1);
    if (reduced || bracket.rounds < 2) {
      setRun(null);
      setPicks(out.picks);
    } else {
      setPicks({});
      setRun({ picks: out.picks, shown: 1 });
    }
    const w = out.champion === null ? null : nameOf(names, out.champion);
    setSay(w ? `simulated run ${runNo + 1}: ${w} is the ${copy.champ}.` : `simulated run ${runNo + 1}.`);
  }

  function reset() {
    setRun(null);
    setPicks({});
    setSay('bracket reset.');
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (e.key === 'Escape') { setTip(null); return; }
    if (!el.matches?.('button.br-slot')) return;
    const dRound = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const dRow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!dRound && !dRow) return;
    e.preventDefault();
    const all = [...(canvasRef.current?.querySelectorAll<HTMLButtonElement>('button.br-slot') ?? [])];
    const meta = (b: HTMLElement) => ({ round: Number(b.dataset.round), y: Number(b.dataset.y) });
    const me = meta(el);
    const pool = all.filter((b) => meta(b).round === me.round + dRound);
    const sorted = (dRound ? pool : all.filter((b) => meta(b).round === me.round && b !== el)).sort((a, b) => meta(a).y - meta(b).y);
    const target = dRound
      ? sorted.sort((a, b) => Math.abs(meta(a).y - me.y) - Math.abs(meta(b).y - me.y))[0]
      : (dRow > 0 ? sorted.find((b) => meta(b).y > me.y) : [...sorted].reverse().find((b) => meta(b).y < me.y));
    target?.focus();
  }

  const probOf = (m: ResolvedMatch, side: 'a' | 'b') => {
    if (!m.ready) return null;
    const mu = matchupOf(bracket, ctx, m.round, m.a.rid!, m.b.rid!);
    return side === 'a' ? mu.pAdvanceA : mu.pAdvanceB;
  };

  const tipMatch = tip ? resolved.find((m) => m.id === tip) : undefined;
  const tipPlaced = tipMatch ? layout.placed.find((p) => p.id === tipMatch.id) : undefined;

  const rows = useMemo(() => Object.entries(odds)
    .map(([rid, v]) => ({ rid: Number(rid), v, seed: bracket.seeds[Number(rid)] ?? 99 }))
    .sort((a, b) => b.v.crowned - a.v.crowned || b.v.final - a.v.final || a.seed - b.seed), [odds, bracket]);

  const maxFinal = Math.max(0.01, ...rows.map((r) => r.v.final));
  const maxCrowned = Math.max(0.01, ...rows.map((r) => r.v.crowned));

  if (bracket.matches.length === 0) return <p className="note">not enough teams for a bracket.</p>;

  const columns = Array.from({ length: bracket.rounds }, (_, i) => i + 1);

  return (
    <div className="br" data-kind={bracket.kind} data-origin={bracket.origin}>
      <div className="row br-controls">
        <button type="button" className="btn solid" onClick={simIt}>{runNo === 0 ? 'sim it' : 'reroll'}</button>
        <button type="button" className="btn warn" onClick={reset} disabled={nPicked === 0 && !run}>reset</button>
        <span className="note br-count">{open.length ? `${nPicked} of ${open.length} open games picked` : 'every game has been played'}</span>
        <ShareButton card={bracketCard({ bracket, resolved, names, meRid, champion, picks: nPicked })} />
      </div>
      <p className="note br-hint">{copy.hint}</p>
      {caption && <p className="note br-caption">{caption}</p>}
      <p className="sr-only" role="status" aria-live="polite">{say}</p>

      <div className="tw br-scroll">
        <div
          className="br-canvas" ref={canvasRef} role="group" aria-label={`${copy.name} bracket`}
          style={{ width: layout.width, height: layout.height + HEAD_H }} onKeyDown={onKeyDown}
        >
          <svg className="br-lines" width={layout.width} height={layout.height + HEAD_H} aria-hidden="true">
            {layout.connectors.map((c) => {
              const from = resolved.find((m) => m.id === c.from);
              const on = from?.advancer !== null && from?.advancer !== undefined;
              return <path key={`${c.from}-${c.to}`} d={c.path} className={on ? 'br-line on' : 'br-line'} />;
            })}
            {layout.champPath && <path d={layout.champPath} className={champion !== null ? 'br-line on' : 'br-line'} />}
          </svg>

          {columns.map((r) => (
            <div key={r} className="br-head micro" style={{ left: (r - 1) * (COL_W + GAP_W), width: COL_W }}>
              {roundLabel(r, bracket.rounds)} <span className="dim">· {weeksLabel(bracket.roundWeeks[r - 1] ?? [])}</span>
            </div>
          ))}
          {layout.champ && <div className="br-head micro" style={{ left: layout.champ.x, width: COL_W }}>{copy.champ}</div>}

          {resolved.map((m) => {
            const p = layout.placed.find((x) => x.id === m.id)!;
            const a = nameOf(names, m.a.rid ?? 0), b = nameOf(names, m.b.rid ?? 0);
            const label = m.ready
              ? `round ${m.round}, game ${m.index + 1}: ${a} versus ${b}${m.locked ? ', final' : ''}`
              : `round ${m.round}, game ${m.index + 1}: waiting for earlier rounds`;
            return (
              <div
                key={m.id} className="br-match" role="group" aria-label={label} data-locked={m.locked || undefined}
                style={{ left: p.x, top: p.y, width: COL_W, height: MATCH_H }}
                onMouseLeave={() => setTip((t) => (t === m.id ? null : t))}
              >
                {(['a', 'b'] as const).map((side) => {
                  const slot = side === 'a' ? m.a : m.b;
                  const bye = side === 'a' ? m.aBye : m.bBye;
                  const prob = probOf(m, side);
                  if (slot.rid === null) {
                    return <div key={side} className="br-slot empty" style={{ height: SLOT_H }}><span className="dim">{bye ? 'bye' : 'to be decided'}</span></div>;
                  }
                  const rid = slot.rid;
                  const who = nameOf(names, rid);
                  const adv = m.advancer === rid;
                  const decided = m.advancer !== null;
                  const shownPts = sc.mean(rid, m.round);
                  const state = adv ? 'adv' : decided ? 'out' : undefined;
                  // the accessible name is the visible text plus visually hidden context (no aria-label), so it always
                  // contains what is printed on the button, in order (WCAG 2.5.3, label in name)
                  const status = adv ? (m.locked ? `${copy.advanced} (final result)` : toilet ? 'flushed' : 'advances') : null;
                  const canPick = m.ready && !m.locked;
                  return (
                    <button
                      key={side} type="button" className={`br-slot${rid === meRid ? ' me' : ''}`} style={{ height: SLOT_H }}
                      data-state={state} data-round={m.round} data-y={p.cy + (side === 'a' ? -SLOT_H / 2 : SLOT_H / 2)}
                      aria-pressed={canPick ? adv && m.picked : undefined} aria-disabled={canPick ? undefined : true}
                      aria-describedby={tip === m.id ? `${uid}-tip` : undefined}
                      onClick={() => choose(m, rid)}
                      onMouseEnter={() => setTip(m.id)} onFocus={() => setTip(m.id)}
                      onBlur={() => setTip((t) => (t === m.id ? null : t))}
                    >
                      {/* hidden words sit beside the visible spans (absolutely positioned, so the layout is untouched) */}
                      {slot.seed !== null && <><span className="sr-only">seed</span>{' '}</>}<span className="br-seed">{slot.seed ?? ''}</span>
                      <span className="sr-only">,</span>{' '}<span className="br-name">{who}{bye && <em className="br-bye">bye</em>}</span>
                      <span className="sr-only">, projected</span>{' '}<span className="br-pts">{formatPoints1(shownPts)}</span>{' '}<span className="sr-only">points</span>
                      {adv && toilet
                        ? <><span className="sr-only">,</span>{' '}<span className="pill bad br-stamp">flushed</span></>
                        : <>{prob !== null && <><span className="sr-only">,</span>{' '}</>}<span className="br-p">{prob === null ? '' : formatOdds(prob)}</span>{prob !== null && <>{' '}<span className="sr-only">{copy.chance} round {m.round}</span></>}</>}
                      {status && !(adv && toilet && !m.locked) && <span className="sr-only">, {status}</span>}
                      {m.ready && !m.locked && <span className="sr-only">, {copy.verb}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {layout.champ && (
            <div
              className="br-champ" data-state={champion !== null ? 'crowned' : 'open'} data-kind={bracket.kind}
              style={{ left: layout.champ.x, top: layout.champ.y + 0, width: COL_W, height: CHAMP_H }}
            >
              {champion !== null ? (
                <>
                  {bracket.kind === 'championship' && <Uprights key={champion} />}
                  <span className="br-champ-label micro">{copy.champ}</span>
                  <span className="br-champ-name">{nameOf(names, champion)}</span>
                  <span className="br-rule" aria-hidden="true" />
                  <span className="br-champ-line">{copy.line}</span>
                </>
              ) : (
                <>
                  <span className="br-champ-label micro">{copy.champ}</span>
                  <span className="br-champ-name dim">to be decided</span>
                </>
              )}
            </div>
          )}

          {tipMatch && tipPlaced && (
            <div
              id={`${uid}-tip`} role="tooltip" className="br-tip"
              style={{ left: tipPlaced.x, top: tipPlaced.y < 150 ? tipPlaced.y + MATCH_H + 6 : tipPlaced.y - 6, transform: tipPlaced.y < 150 ? undefined : 'translateY(-100%)' }}
            >
              <Tip m={tipMatch} bracket={bracket} ctx={ctx} names={names} />
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="br-odds">
          <div className="micro">{copy.odds} odds{nPicked ? ` with your ${nPicked} pick${nPicked === 1 ? '' : 's'}` : ''}</div>
          <div className="tw">
            <table>
              <caption className="sr-only">{copy.name} odds</caption>
              <thead>
                <tr><th scope="col">team</th><th scope="col" className="n">seed</th><th scope="col">in the final</th><th scope="col">{copy.oddsHeader}</th></tr>
              </thead>
              <tbody>
                {rows.map(({ rid, v, seed }) => (
                  <tr key={rid} className={rid === meRid ? 'me' : undefined}>
                    <td><span className="pname">{nameOf(names, rid)}</span>{rid === meRid && <span className="you">you</span>}</td>
                    <td className="n dim">{seed === 99 ? '' : seed}</td>
                    <td><OddsCell value={v.final} tone="scale" max={maxFinal} /></td>
                    <td>{toilet ? <OddsCell value={v.crowned} invert /> : <OddsCell value={v.crowned} tone="scale" max={maxCrowned} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** The head-to-head numbers of one game. */
function Tip({ m, bracket, ctx, names }: { m: ResolvedMatch; bracket: BracketData; ctx: BracketCtx; names: ReadonlyMap<number, string> }) {
  const copy = copyFor(bracket.kind);
  const weeks = bracket.roundWeeks[m.round - 1] ?? [];
  if (!m.ready) {
    return <><b>round {m.round}</b><span className="dim"> · {weeksLabel(weeks)}</span><div className="note">waiting for the earlier rounds to be decided.</div></>;
  }
  const mu = matchupOf(bracket, ctx, m.round, m.a.rid!, m.b.rid!);
  const row = (rid: number, mean: number, p: number, pOut: number) => (
    <div className="br-tip-row"><span>{nameOf(names, rid)}</span><span className="n">{formatPoints1(mean)} proj</span><span className="n">{formatOdds(pOut)} to outscore</span><span className="n dim">{formatOdds(p)} {copy.chance}</span></div>
  );
  return (
    <>
      <div><b>round {m.round}</b><span className="dim"> · {weeksLabel(weeks)}{weeks.length > 1 ? ' added together' : ''}</span></div>
      {row(m.a.rid!, mu.meanA, mu.pAdvanceA, mu.pOutscoreA)}
      {row(m.b.rid!, mu.meanB, mu.pAdvanceB, 1 - mu.pOutscoreA)}
      <div className="note">projected margin {formatPoints1(Math.abs(mu.meanA - mu.meanB))} points, {m.locked ? 'game played' : 'game still to play'}.</div>
    </>
  );
}
