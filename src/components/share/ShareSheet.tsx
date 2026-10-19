import { useEffect, useMemo, useRef, useState } from 'react';
import { cardAlt } from '../../engine/share';
import type { CardSpec, CardTheme } from '../../engine/share';
import { useTheme } from '../../app/useTheme';
import { Drawer } from '../Drawer';
import { Segmented } from '../Segmented';
import { canCopyImage, canShareFile, cardFile, copyImage, downloadFile, shareFile } from './flow';
import { renderCard } from './render';
import type { RenderedCard } from './render';

interface Props {
  spec: CardSpec;
  open: boolean;
  onClose: () => void;
}

const KIND_LABEL: Record<CardSpec['kind'], string> = {
  matchup: 'matchup card', take: 'hot take card', bracket: 'bracket card', grade: 'draft grade card', huddle: 'huddle card',
};

type Done = { state: 'ready'; card: RenderedCard; url: string; file: File } | { state: 'error'; message: string };
type Load = Done | { state: 'drawing' };

/** The share sheet: a preview of the image, a light or dark look, and the ways out. The image is drawn as soon as the sheet opens (and again when
    the look changes), so that "share" can open the system sheet straight from the tap: browsers only allow it inside a user gesture. */
export function ShareSheet({ spec, open, onClose }: Props) {
  const { resolved } = useTheme();
  const [look, setLook] = useState<CardTheme | null>(null);
  const theme = look ?? resolved;
  // the spec is plain data: its text is its identity, so a parent that rebuilds the object each render does not redraw the card
  const key = useMemo(() => JSON.stringify(spec), [spec]);
  const id = `${theme}|${key}`;
  const [result, setResult] = useState<{ id: string; done: Done } | null>(null);
  const [said, setSaid] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const specRef = useRef(spec);
  useEffect(() => { specRef.current = spec; });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let url: string | null = null;
    renderCard(specRef.current, { theme }).then(
      (card) => {
        if (!alive) return;
        url = URL.createObjectURL(card.blob);
        setResult({ id, done: { state: 'ready', card, url, file: cardFile(card.blob, card.fileName) } });
      },
      (e: unknown) => { if (alive) setResult({ id, done: { state: 'error', message: e instanceof Error ? e.message : 'the card could not be drawn' } }); },
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, id, theme]);

  // a result for another look or another card is stale: the sheet shows "drawing" until the new one lands
  const load: Load = result && result.id === id ? result.done : { state: 'drawing' };
  const say = said && said.id === id ? said.text : '';
  const setSay = (text: string) => setSaid({ id, text });
  if (!open) return null;
  const ready = load.state === 'ready' ? load : null;
  const canShare = ready ? canShareFile(ready.file) : false;
  const canCopy = canCopyImage();

  async function run(label: string, fn: () => Promise<string | void> | string | void) {
    setBusy(true);
    try {
      const done = await fn();
      setSay(typeof done === 'string' ? done : label);
    } catch (e) {
      const why = (e as { message?: unknown } | null)?.message;
      setSay(`${typeof why === 'string' && why ? why : 'that did not work'}. try save image instead.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="share" kicker={KIND_LABEL[spec.kind]}>
      <div className="share-sheet">
        <div className="share-preview" data-state={load.state}>
          {ready ? (
            <img src={ready.url} alt={cardAlt(spec)} width={1080} height={1350} />
          ) : load.state === 'error' ? (
            <p className="note neg-c" role="alert">{load.message}</p>
          ) : (
            <p className="note" role="status">drawing the card…</p>
          )}
        </div>
        <Segmented<CardTheme>
          label="card look" value={theme} onChange={setLook}
          options={[{ value: 'light', label: 'light' }, { value: 'dark', label: 'dark' }]}
        />
        <div className="share-actions">
          {canShare && (
            <button
              type="button" className="btn solid share-act" disabled={!ready || busy}
              onClick={() => ready && run('shared', async () => ((await shareFile(ready.file, cardAlt(spec))) === 'shared' ? 'shared' : ''))}
            >share</button>
          )}
          <button
            type="button" className={`btn share-act${canShare ? '' : ' solid'}`} disabled={!ready || busy}
            onClick={() => ready && run('saved', () => { downloadFile(ready.card.blob, ready.card.fileName); return 'saved to your downloads'; })}
          >save image</button>
          {canCopy && (
            <button
              type="button" className="btn share-act" disabled={!ready || busy}
              onClick={() => ready && run('copied', async () => { await copyImage(ready.card.blob); return 'copied. paste it into the chat'; })}
            >copy image</button>
          )}
        </div>
        <p className="note share-say" role="status" aria-live="polite">{say || (ready ? 'image ready' : '')}</p>
      </div>
    </Drawer>
  );
}
