import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// findBy*/waitFor default to 1 s; several pages finish a simulation (worker fallback in jsdom) before they render,
// which can take longer when the whole suite runs in parallel
import { configure } from '@testing-library/react';
configure({ asyncUtilTimeout: 5000 });
