import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/instrument-serif/400.css';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/components.css';
import { ArtGallery } from './ArtGallery';

createRoot(document.getElementById('root')!).render(<StrictMode><ArtGallery /></StrictMode>);
