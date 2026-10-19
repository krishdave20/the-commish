import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TakeCardData } from '../../engine/share';
import { canCopyImage, canShareFile, cardFile, copyImage, downloadFile, shareFile } from './flow';
import { clearHeadshotCache, fetchHeadshot, loadHeadshots, sniffImage } from './headshots';

vi.mock('./render', () => ({
  renderCard: vi.fn(async () => ({ blob: new Blob(['png'], { type: 'image/png' }), fileName: 'the-commish-take-ceedee-lamb.png', width: 2160, height: 2700, photos: 1, monograms: 0 })),
}));
import { renderCard } from './render';
import { ShareButton } from './ShareButton';

const take: TakeCardData = {
  kind: 'take', headline: 'cd lamb is up', statLine: '0.31 vs 0.22', tone: 'good', toneLabel: 'good news', kindLabel: 'usage spike', week: 8,
  player: { pid: '6786', name: 'CeeDee Lamb', pos: 'WR', team: 'DAL' }, trackRecord: null, dataLabel: null,
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:card');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearHeadshotCache();
  for (const k of ['share', 'canShare', 'clipboard']) Reflect.deleteProperty(navigator, k);
});

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const reply = (body: Uint8Array, init: ResponseInit = {}) => new Response(body as BlobPart, { status: 200, ...init });

describe('headshots: CORS-safe images only', () => {
  it('reads the type from the bytes (Sleeper labels a PNG as jpeg) and refuses a non-image', () => {
    expect(sniffImage(png)).toBe('image/png');
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(sniffImage(new TextEncoder().encode('<html>forbidden</html>'))).toBeNull();
  });

  it('fetches with CORS and no credentials or referrer, and returns a data: URL', async () => {
    const f = vi.fn(async () => reply(png, { headers: { 'content-type': 'image/jpeg' } }));
    const url = await fetchHeadshot('4881', f);
    expect(url).toMatch(/^data:image\/png;base64,/);
    expect(f).toHaveBeenCalledWith('https://sleepercdn.com/content/nfl/players/thumb/4881.jpg', expect.objectContaining({ mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' }));
    // the second ask is answered from memory
    await fetchHeadshot('4881', f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('gives null (so the card draws a monogram) on a network or CORS failure, an error status, a non-image body or a timeout', async () => {
    expect(await fetchHeadshot('1', vi.fn(async () => { throw new TypeError('Failed to fetch'); }))).toBeNull();
    expect(await fetchHeadshot('2', vi.fn(async () => reply(png, { status: 403 })))).toBeNull();
    expect(await fetchHeadshot('3', vi.fn(async () => reply(new TextEncoder().encode('<html>')))))
      .toBeNull();
    const slow = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => { init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); }));
    expect(await fetchHeadshot('4', slow, 10)).toBeNull();
  });

  it('retries past the browser cache when a cached copy lacks the CORS header', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.cache !== 'reload') throw new TypeError('Failed to fetch');
      return reply(png);
    });
    expect(await fetchHeadshot('9', f)).toMatch(/^data:image\/png/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('never asks for a team defense or a non-numeric id', async () => {
    const f = vi.fn(async () => reply(png));
    const out = await loadHeadshots([{ pid: 'KC', name: 'Kansas City', pos: 'DEF', team: 'KC' }, { pid: 'abc', name: 'x' }, { pid: '7', name: 'Real Guy', pos: 'WR' }, { pid: '7', name: 'Real Guy', pos: 'WR' }], f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(Object.keys(out)).toEqual(['7']);
  });
});

describe('share flow: the ways out', () => {
  const file = () => cardFile(new Blob(['x'], { type: 'image/png' }), 'card.png');

  it('Web Share with files: canShare is asked about the file, and only the file and a title are sent', async () => {
    const share = vi.fn(async () => {});
    const canShare = vi.fn(() => true);
    Object.assign(navigator, { share, canShare });
    const f = file();
    expect(f.type).toBe('image/png');
    expect(canShareFile(f)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [f] });
    expect(await shareFile(f, 'a card')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [f], title: 'a card' });
  });

  it('is not available when the browser cannot share files (or has no share at all)', () => {
    Object.assign(navigator, { share: vi.fn(), canShare: vi.fn(() => false) });
    expect(canShareFile(file())).toBe(false);
    Reflect.deleteProperty(navigator, 'canShare');
    expect(canShareFile(file())).toBe(false);
  });

  it('closing the system sheet is a cancel, not an error; any other failure is thrown', async () => {
    Object.assign(navigator, { share: vi.fn(async () => { throw new DOMException('cancelled', 'AbortError'); }), canShare: () => true });
    expect(await shareFile(file(), 't')).toBe('cancelled');
    Object.assign(navigator, { share: vi.fn(async () => { throw new DOMException('no gesture', 'NotAllowedError'); }) });
    await expect(shareFile(file(), 't')).rejects.toThrow('no gesture');
  });

  it('download fallback: a temporary link with the download name is clicked', () => {
    const seen: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) { seen.push(this); });
    downloadFile(new Blob(['x']), 'the-commish-huddle.png');
    expect(click).toHaveBeenCalledTimes(1);
    expect(seen[0]!.download).toBe('the-commish-huddle.png');
    expect(seen[0]!.href).toBe('blob:card');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('clipboard fallback: writes an image/png ClipboardItem', async () => {
    const write = vi.fn(async () => {});
    class FakeItem { items: Record<string, Blob>; constructor(items: Record<string, Blob>) { this.items = items; } }
    vi.stubGlobal('ClipboardItem', FakeItem);
    Object.assign(navigator, { clipboard: { write } });
    expect(canCopyImage()).toBe(true);
    const blob = new Blob(['x'], { type: 'image/png' });
    await copyImage(blob);
    const item = (write.mock.calls[0] as unknown as [FakeItem[]])[0][0]!;
    expect(item.items['image/png']).toBe(blob);
  });

  it('copy is not offered without ClipboardItem', () => {
    vi.stubGlobal('ClipboardItem', undefined);
    expect(canCopyImage()).toBe(false);
  });
});

describe('ShareButton and the sheet', () => {
  async function open() {
    const user = userEvent.setup();
    render(<ShareButton card={take} />);
    const btn = screen.getByRole('button', { name: 'share this take' });
    await user.click(btn);
    const dialog = await screen.findByRole('dialog', { name: 'share' });
    await within(dialog).findByRole('img', { name: /hot take card/ });
    return { user, btn, dialog };
  }

  it('is a button named for what it shares, with an icon and the word "share"', () => {
    render(<ShareButton card={take} />);
    const btn = screen.getByRole('button', { name: 'share this take' });
    expect(btn).toHaveTextContent('share');
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
    expect(btn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('opens a sheet that draws the card for the current look and previews it with a description', async () => {
    const { dialog } = await open();
    expect(renderCard).toHaveBeenCalledWith(take, { theme: 'light' });
    expect(within(dialog).getByRole('img', { name: 'hot take card: cd lamb is up' })).toHaveAttribute('src', 'blob:card');
    expect(within(dialog).getByRole('status')).toHaveTextContent('image ready');
  });

  it('with Web Share and clipboard support: share, save image and copy image are all there; share sends the file', async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true, clipboard: { write: vi.fn(async () => {}) } });
    vi.stubGlobal('ClipboardItem', class { constructor(_i: unknown) {} });
    const { user, dialog } = await open();
    expect(within(dialog).getByRole('button', { name: 'share' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'save image' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'copy image' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'share' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = (share.mock.calls[0] as unknown as [{ files: File[]; title: string }])[0];
    expect(arg.files[0]!.name).toBe('the-commish-take-ceedee-lamb.png');
    expect(arg.files[0]!.type).toBe('image/png');
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('shared'));
  });

  it('without Web Share: only save image (and copy when the clipboard takes images); save downloads the PNG', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user, dialog } = await open();
    expect(within(dialog).queryByRole('button', { name: 'share' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'copy image' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'save image' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('status')).toHaveTextContent('saved to your downloads');
  });

  it('copy image writes the PNG to the clipboard and says so', async () => {
    vi.stubGlobal('ClipboardItem', class { constructor(_i: unknown) {} });
    const { user, dialog } = await open();
    // user-event installs its own clipboard on setup: spy on that one
    const write = vi.spyOn(navigator.clipboard, 'write').mockResolvedValue(undefined);
    await user.click(within(dialog).getByRole('button', { name: 'copy image' }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('status')).toHaveTextContent('copied');
  });

  it('a failed share points to save image instead', async () => {
    Object.assign(navigator, { share: vi.fn(async () => { throw new DOMException('needs a tap', 'NotAllowedError'); }), canShare: () => true });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'share' }));
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('needs a tap. try save image instead.'));
  });

  it('redraws in the other look when asked, and Escape closes the sheet and returns focus to the button', async () => {
    const { user, btn, dialog } = await open();
    await user.click(within(dialog).getByRole('radio', { name: 'dark' }));
    await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(take, { theme: 'dark' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });

  it('shows the reason when the card cannot be drawn', async () => {
    vi.mocked(renderCard).mockRejectedValueOnce(new Error('this browser cannot draw the card'));
    const user = userEvent.setup();
    render(<ShareButton card={take} />);
    await user.click(screen.getByRole('button', { name: 'share this take' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('this browser cannot draw the card');
    expect(screen.getByRole('button', { name: 'save image' })).toBeDisabled();
  });
});
