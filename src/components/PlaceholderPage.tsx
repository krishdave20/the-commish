import type { Freshness } from '../app/hooks';
import { useLeagueBundle } from '../app/hooks';
import { PAGES } from '../app/names';
import type { PageKey } from '../app/names';
import { usePageTitle } from '../app/usePageTitle';
import { PageHeader } from './PageHeader';

interface Props {
  /** which page this stands in for; names come from names.ts */
  page: PageKey;
  /** what the page will hold */
  items: string[];
  milestone: number;
  /** milestone name for the pill */
  milestoneName: string;
}

/** A styled stand-in for a page that a later milestone delivers. Its header still tracks the league bundle. */
export function PlaceholderPage({ page, items, milestone, milestoneName }: Props) {
  const bundle = useLeagueBundle();
  const p = PAGES[page];
  usePageTitle(p.path);
  const freshness: Freshness = bundle;
  return (
    <div className="page page-fade">
      <PageHeader kicker={p.kicker} title={p.name} data={freshness} />
      <section className="card" aria-labelledby="ph-will-hold">
        <header>
          <div className="row">
            <h2 id="ph-will-hold">What will live here</h2>
            <span className="pill mute milestone">Milestone {milestone}</span>
          </div>
          <p className="note">{p.blurb}</p>
        </header>
        <ul className="todo">
          {items.map((it) => <li key={it}><span>{it}</span></li>)}
        </ul>
        <p className="note">Delivered in milestone {milestone}: {milestoneName}.</p>
      </section>
    </div>
  );
}
