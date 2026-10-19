import { useMediaQuery } from '../useMediaQuery';

/** A screen too short for an expanded card: a phone on its side (667 x 375), or with the keyboard up, and any touch screen under 520 px tall (a big phone
    on its side is wider than the phone breakpoint, but just as short). The pill stays, compact; the card does not open. */
export const SHORT_QUERY = '(max-width: 760px) and (max-height: 520px), (pointer: coarse) and (max-height: 520px)';

export function useShortScreen(): boolean {
  return useMediaQuery(SHORT_QUERY);
}
