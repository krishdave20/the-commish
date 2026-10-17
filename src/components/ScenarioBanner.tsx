import type { ReactNode } from 'react';

interface Props {
  /** what changed, e.g. "Adding J. Doe and dropping A. Smith" */
  what: ReactNode;
  /** a small chip such as "playoffs 62% (+6)" */
  chip?: { text: string; tone: 'up' | 'down' | 'flat' };
  onReset: () => void;
  onEdit?: () => void;
}

/** The gold what-if banner shown above results that no longer match the model run. */
export function ScenarioBanner({ what, chip, onReset, onEdit }: Props) {
  return (
    <div className="scen" role="status">
      <div className="what">
        <span className="micro">What-if active</span>
        <br />
        You’re looking at a what-if: {what}
      </div>
      <div className="row">
        {chip && <span className={`chip ${chip.tone}`}>{chip.text}</span>}
        {onEdit && <button type="button" className="btn quiet" onClick={onEdit}>Edit</button>}
        <button type="button" className="btn warn" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
}
