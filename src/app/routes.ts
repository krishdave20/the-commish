import { FOOTER_KEYS, NAV_GROUPS, PAGES } from './names';

export interface NavItem { path: string; label: string }
export interface NavGroup { label: string; items: NavItem[] }

const item = (k: keyof typeof PAGES): NavItem => ({ path: PAGES[k].path, label: PAGES[k].name });

/** The nine pages of the grouped navigation (names from names.ts). Sign-in lives outside the shell at /signin. */
export const NAV_GROUP_LIST: NavGroup[] = NAV_GROUPS.map((g) => ({ label: g.label, items: g.keys.map(item) }));

/** The same nine, flat and in order. */
export const NAV: NavItem[] = NAV_GROUP_LIST.flatMap((g) => g.items);

/** front office and under the hood, quietly at the bottom */
export const FOOTER_NAV: NavItem[] = FOOTER_KEYS.map(item);

export const SIGN_IN_PATH = PAGES.signin.path;
export const METHOD_PATH = PAGES.method.path;
