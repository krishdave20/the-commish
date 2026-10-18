import { useId } from 'react';
import type { ReactNode } from 'react';
import { Segmented } from './Segmented';
import { usePageTab } from './usePageTab';
import type { PageTabOptions } from './usePageTab';

export interface PageTab<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> extends PageTabOptions {
  tabs: ReadonlyArray<PageTab<T>>;
  /** accessible name for the tab group */
  label: string;
  /** the tab that shows with no `?tab=` (default: the first) */
  defaultTab?: T;
  /** the panel for the open tab. Only the open tab renders, so a hidden tab costs nothing. */
  children: (tab: T, setTab: (tab: T) => void) => ReactNode;
}

/** In-page tabs: a `Segmented` radio group synced to `?tab=`. The default tab is omitted from the URL.
    Focus stays on the control while you arrow through it (the radio pattern); the panel is a labelled group right below. */
export function PageTabs<T extends string>({ tabs, label, defaultTab, param, aliases, children }: Props<T>) {
  const first = defaultTab ?? tabs[0].value;
  const [tab, setTab] = usePageTab(tabs.map((t) => t.value), first, { param, aliases });
  const panel = useId();
  const current = tabs.find((t) => t.value === tab);
  return (
    <div className="tabs">
      <Segmented label={label} value={tab} onChange={setTab} options={[...tabs]} />
      <div className="tab-panel" id={panel} role="group" aria-label={current?.label} key={tab}>
        {children(tab, setTab)}
      </div>
    </div>
  );
}
