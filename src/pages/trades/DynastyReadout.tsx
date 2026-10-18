import { signedPct, formatCount, formatNum } from '../../app/format';
import { Kpi } from '../../components/Kpi';
import type { DynastyTradeEval } from '../../engine/dynasty/index.ts';
import type { LensTeam } from '../../engine/dynasty/index.ts';

const signedInt = (n: number) => `${Math.round(n) > 0 ? '+' : Math.round(n) < 0 ? '−' : '±'}${formatCount(Math.abs(n))}`;

/** Value out, value in and the net, then the verdict for your lens. Sits under the redraft KPIs. */
export function DynastyReadout({ ev, me, partner, partnerName }: {
  ev: DynastyTradeEval;
  me: LensTeam | undefined;
  partner: LensTeam | undefined;
  partnerName: string;
}) {
  const tone = ev.verdict === 'take it' ? 'pos-c' : ev.verdict === 'pass' ? 'neg-c' : '';
  return (
    <div className="stack" aria-live="polite">
      <div className="kpis" aria-label="Dynasty value">
        <Kpi label="value you send" sub="fantasycalc, players and picks"><span>{formatCount(ev.given)}</span></Kpi>
        <Kpi label="value you get" sub="fantasycalc, players and picks"><span>{formatCount(ev.received)}</span></Kpi>
        <Kpi label="net dynasty value" sub={`${signedPct(ev.relNet)}% of the bigger side`}>
          <span className={ev.net > 0 ? 'pos-c' : ev.net < 0 ? 'neg-c' : ''}>{signedInt(ev.net)}</span>
        </Kpi>
        <Kpi label="verdict" sub={me ? `for ${me.label === 'all-in' ? 'an' : 'a'} ${me.label}` : 'lens not ready'}>
          <span className={tone}>{ev.verdict}</span>
        </Kpi>
      </div>
      <p className="take" data-testid="dynasty-verdict">{ev.message}</p>
      {me && partner && (
        <p className="note">
          you read as {me.label === 'all-in' ? 'an' : 'a'} {me.label} (now {formatNum(me.nowScore, 2)}, later {formatNum(me.futureScore, 2)}); {partnerName} reads as {partner.label === 'all-in' ? 'an' : 'a'} {partner.label}.
        </p>
      )}
    </div>
  );
}
