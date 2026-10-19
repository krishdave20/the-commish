import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/bracket.css';
import './styles/theme.css';
import { App } from './App.tsx';
import './styles/phone.css'; // after every other stylesheet (the app's imports above pull in the page ones), so a phone rule wins a tie
import { StartupError } from './app/StartupError.tsx';
import { createAccountStore, createDataLayer } from './data';
import { startPwa } from './app/pwa';

function boot() {
  try {
    const layer = createDataLayer();
    return <App api={layer.api} sleeper={layer.sleeper} nflverse={layer.nflverse} accounts={createAccountStore()} />;
  } catch (e) {
    return <StartupError message={e instanceof Error ? e.message : String(e)} />;
  }
}

startPwa(); // install offer + service worker (production only)
createRoot(document.getElementById('root')!).render(<StrictMode>{boot()}</StrictMode>);
