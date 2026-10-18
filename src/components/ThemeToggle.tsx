import { nextThemePref, type ThemePref } from '../app/theme';
import { useTheme } from '../app/useTheme';

/** One small button that cycles system, light, dark. The icon shows the current choice (a half-filled disc for "system"), the name says it
    ("appearance: system") and the tooltip says what a click does. 32 px on a pointer, 44 px on a touch screen (theme.css). */
export function ThemeToggle({ className }: { className?: string }) {
  const { pref, cycle } = useTheme();
  const label = `appearance: ${pref}`;
  return (
    <button
      type="button"
      className={className ? `theme-toggle ${className}` : 'theme-toggle'}
      aria-label={label}
      title={`${label} (click for ${nextThemePref(pref)})`}
      data-pref={pref}
      onClick={cycle}
    >
      <ThemeIcon pref={pref} />
    </button>
  );
}

/** Fine line art in the app's hand: round caps, currentColor, no fill colours of its own. */
function ThemeIcon({ pref }: { pref: ThemePref }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {pref === 'light' && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
        </>
      )}
      {pref === 'dark' && <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
      {pref === 'system' && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
