import { Segmented } from './Segmented';
import type { ThemePref } from '../app/theme';
import { useTheme } from '../app/useTheme';

/** Appearance as a visible switch: light, dark, or auto (follow the system). The labels are the names, so what you read is what a reader hears.
    The choice is the same one the old cycling icon kept (`wr.theme.v1`); "auto" removes the override. 44 px targets on a touch screen come from `.seg`. */
const OPTIONS: Array<{ value: ThemePref; label: string }> = [
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
  { value: 'system', label: 'auto' },
];

export function ThemeSwitch({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  return (
    <div className={className ? `theme-switch ${className}` : 'theme-switch'}>
      <Segmented label="Appearance" value={pref} onChange={setPref} options={OPTIONS} />
    </div>
  );
}
