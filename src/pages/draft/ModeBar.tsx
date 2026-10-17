import { useState } from 'react';
import { Segmented } from '../../components/Segmented';
import { isDynasty } from '../../engine';
import type { DraftMode } from '../../engine';
import type { DraftInputs, Rankings } from '../../engine';
import type { SleeperLeague } from '../../data';
import { DRAFT_TEXT } from './model';

interface Props {
  league: SleeperLeague;
  /** the mode the league's draft is for */
  draftMode: DraftMode;
  /** the mode being shown */
  shown: DraftMode;
  /** the mode asked for (differs from `shown` while its numbers load) */
  wanted: DraftMode;
  rankings: Rankings;
  inputs: DraftInputs;
  onChange: (m: DraftMode) => void;
}

const OPTIONS: Array<{ value: DraftMode; label: string }> = [
  { value: 'redraft', label: 'redraft' },
  { value: 'startup', label: 'startup' },
  { value: 'rookie', label: 'rookie' },
];

/** Mode selector (dynasty leagues always; other leagues behind "explore"), the active ADP column and the FantasyCalc status. */
export function ModeBar({ league, draftMode, shown, wanted, rankings, inputs, onChange }: Props) {
  const dynasty = isDynasty(league);
  const [explore, setExplore] = useState(false);
  const open = dynasty || explore || wanted !== draftMode;
  const fc = inputs.fantasyCalc;
  return (
    <div className="stack mode-bar">
      <div className="row">
        {open && <Segmented label="Draft mode" value={wanted} onChange={onChange} options={OPTIONS} />}
        {!open && <span className="chip flat">mode: {draftMode}</span>}
        <span className="chip">adp: {rankings.adpField}</span>
        {shown !== 'redraft' && fc.ok && <span className="chip up">{DRAFT_TEXT.fantasycalc}</span>}
        {!dynasty && !open && (
          <button type="button" className="btn quiet" aria-expanded={false} onClick={() => setExplore(true)}>explore startup and rookie values</button>
        )}
      </div>
      {wanted !== draftMode && (
        <p className="note" role="status">
          exploring {wanted} values. your league’s draft is a {draftMode} draft, so this does not change anything in sleeper.{' '}
          <button type="button" className="btn quiet" onClick={() => onChange(draftMode)}>back to {draftMode}</button>
        </p>
      )}
      {wanted !== shown && <p className="note" role="status">loading {wanted} values…</p>}
      {shown !== 'redraft' && !fc.ok && <p className="note" role="status">fantasycalc is not answering, so these rankings use sleeper’s numbers only.</p>}
    </div>
  );
}
