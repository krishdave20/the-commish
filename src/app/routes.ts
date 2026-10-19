import { FOOTER_KEYS, NAV_KEYS, PAGES } from './names';

export interface NavItem { path: string; label: string }

const item = (k: keyof typeof PAGES): NavItem => ({ path: PAGES[k].path, label: PAGES[k].name });

/** The section tabs in order (names from names.ts). Sign-in lives outside the shell at /signin. */
export const NAV: NavItem[] = NAV_KEYS.map(item);

/** under the hood, quietly in the footer */
export const FOOTER_NAV: NavItem[] = FOOTER_KEYS.map(item);

/** the multi-league dashboard: not a section tab, it sits beside the league switcher and in the phone's "more" sheet */
export const LEAGUES_NAV: NavItem = item('leagues');

export const SIGN_IN_PATH = PAGES.signin.path;
export const METHOD_PATH = PAGES.method.path;
