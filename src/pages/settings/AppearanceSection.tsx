import { Disclosure } from '../../components/Disclosure';
import { Segmented } from '../../components/Segmented';
import { ThemeSwitch } from '../../components/ThemeSwitch';
import { savePrefs } from '../../app/prefs';
import { usePrefs } from '../../app/usePrefs';
import { useTheme } from '../../app/useTheme';

/** Appearance (light, dark or auto) and the navigation's smart order, both kept on this device. */
export function AppearanceSection() {
  const { pref, resolved } = useTheme();
  const { smartNav } = usePrefs();
  return (
    <Disclosure title="appearance" id="set-appearance" defaultOpen hint={pref === 'system' ? `auto (${resolved})` : pref}>
      <div className="stack">
        <div className="stack">
          <p>appearance: light, dark, or auto to follow your device.</p>
          <ThemeSwitch />
        </div>
        <div className="stack">
          <p>smart order puts what matters right now up front in the navigation: waivers on tuesday night, game day on sunday. huddle stays first and front office last.</p>
          <Segmented
            label="Smart order" value={smartNav ? 'on' : 'off'} onChange={(v) => savePrefs({ smartNav: v === 'on' })}
            options={[{ value: 'on', label: 'smart order: on' }, { value: 'off', label: 'smart order: off' }]}
          />
        </div>
      </div>
    </Disclosure>
  );
}
