/* A tiny tick for a big moment, where the device can do it (Android browsers; iOS Safari has no vibrate). Never on page load: a vibration is only allowed after the
   viewer has touched the page, so this waits for a first press or key (`navigator.userActivation` when the browser has it, else a flag set by a listener). */
let touched = false;
let armed = false;

/** Start noticing the first touch or key. Safe to call more than once. */
export function armHaptics(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const mark = () => { touched = true; };
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, mark, { capture: true, passive: true });
}

/** Whether the viewer has interacted with the page yet. */
export function hasInteracted(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return touched || !!ua?.hasBeenActive;
}

/** Vibrate for `ms` milliseconds if the device supports it and the viewer has interacted. Returns whether it asked the device to. */
export function tick(ms = 10): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function' || !hasInteracted()) return false;
  try { return navigator.vibrate(ms); } catch { return false; }
}

/** For tests: forget that the viewer has touched anything. */
export function resetHaptics(): void { touched = false; }
