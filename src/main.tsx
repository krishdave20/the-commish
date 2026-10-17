import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { App } from './App.tsx';
import { StartupError } from './app/StartupError.tsx';
import { createAccountStore, createDataLayer } from './data';

function boot() {
  try {
    const layer = createDataLayer();
    return <App api={layer.api} sleeper={layer.sleeper} accounts={createAccountStore()} />;
  } catch (e) {
    return <StartupError message={e instanceof Error ? e.message : String(e)} />;
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode>{boot()}</StrictMode>);
