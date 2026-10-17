import { NAV_KEYS, PAGES } from './names';

export interface NavItem { path: string; label: string }

/** The nine pages behind the sidebar (names from names.ts). Sign-in lives outside the shell at /signin. */
export const NAV: NavItem[] = NAV_KEYS.map((k) => ({ path: PAGES[k].path, label: PAGES[k].name }));

export const SIGN_IN_PATH = PAGES.signin.path;
export const METHOD_PATH = PAGES.method.path;
