/* The three ways a finished card leaves the app, each with the plain-browser feature check it needs. Kept apart from React so the branches test cleanly. */

export const cardFile = (blob: Blob, name: string): File => new File([blob], name, { type: 'image/png' });

/** The Web Share API accepts files (iOS and Android browsers; desktop Chrome and Safari on recent versions). */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'cancelled';

/** Open the system share sheet with the image. Only the file and a title go in: no text, no link. Closing the sheet is not an error. */
export async function shareFile(file: File, title: string): Promise<ShareOutcome> {
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

/** Save the PNG: a temporary link with the `download` attribute. */
export function downloadFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // keep the URL alive long enough for the browser to start the save
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** The async clipboard accepts an image (a secure page, and a browser with ClipboardItem). */
export function canCopyImage(): boolean {
  return typeof navigator !== 'undefined' && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard && typeof navigator.clipboard.write === 'function';
}

export async function copyImage(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
