import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMoments } from '../../app/moments/momentsContext';
import { formatStamp } from '../../engine/moments';
import type { Moment } from '../../engine/moments';

const TOP = 3;

function Row({ m, n }: { m: Moment; n: number }) {
  return (
    <li className="plan-row" data-live={m.live ? 'true' : undefined}>
      <span className="plan-n" aria-hidden="true">{n}</span>
      <div className="plan-text">
        <p className="plan-t">{m.title}</p>
        <p className="plan-d">{m.detail}</p>
      </div>
      <Link className="plan-go" to={m.action.to} aria-label={`${m.action.label}: ${m.title}`}><span aria-hidden="true">→</span></Link>
    </li>
  );
}

/** The dark "game plan" card: the three moments that matter most right now as ranked actions, each with a line of detail and an arrow
    to its page; "see the whole plan" opens the rest. This is where the huddle's lineup alerts and waiver adds live now. */
export function GamePlan() {
  const { moments, ctx, previewing } = useMoments();
  const [all, setAll] = useState(false);
  const list = useId();
  if (!ctx) return null;
  const top = moments.slice(0, TOP), rest = moments.slice(TOP);
  return (
    <section className="plan" aria-labelledby="plan-title">
      <header className="plan-head">
        <h2 id="plan-title">your game plan</h2>
        <span className="plan-when">{previewing ? `preview · ${formatStamp(ctx.now.getTime(), ctx.tz)}` : formatStamp(ctx.now.getTime(), ctx.tz)}</span>
      </header>
      {top.length === 0 ? (
        <p className="plan-empty">nothing needs you right now. the plan fills in as the week moves.</p>
      ) : (
        <ol className="plan-list" aria-label="Top actions right now">
          {top.map((m, i) => <Row key={m.id} m={m} n={i + 1} />)}
        </ol>
      )}
      {rest.length > 0 && (
        <>
          <button type="button" className="plan-more" aria-expanded={all} aria-controls={list} onClick={() => setAll((v) => !v)}>
            {all ? 'show less' : `see the whole plan (${moments.length})`}
          </button>
          <ol className="plan-list plan-rest" id={list} hidden={!all} aria-label="The rest of the plan" start={TOP + 1}>
            {rest.map((m, i) => <Row key={m.id} m={m} n={TOP + 1 + i} />)}
          </ol>
        </>
      )}
    </section>
  );
}
