/* CSV reading for the pipeline. Files are streamed from disk (the 2025 participation file is 49 MB, pbp is 70 MB
   unzipped) and yielded one record at a time, so no file is ever held whole as a string. */
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { parse } from 'csv-parse';
import { parse as parseSync } from 'csv-parse/sync';

export type Rec = Record<string, string>;

const opts = { columns: true, relax_quotes: true, skip_empty_lines: true, relax_column_count: true } as const;

/** Streams a .csv or .csv.gz file as records keyed by header. */
export async function* readCsv(path: string): AsyncGenerator<Rec> {
  let s: NodeJS.ReadableStream = createReadStream(path);
  if (path.endsWith('.gz')) s = s.pipe(createGunzip());
  yield* s.pipe(parse(opts)) as AsyncIterable<Rec>;
}

/** Parses a small CSV string (tests, tiny files). */
export const parseCsv = (text: string): Rec[] => parseSync(text, opts) as Rec[];

/** Collects a stream into an array through `map`; `map` returns null to drop a record. */
export async function collect<T>(rows: AsyncIterable<Rec>, map: (r: Rec) => T | null): Promise<T[]> {
  const out: T[] = [];
  for await (const r of rows) {
    const v = map(r);
    if (v !== null) out.push(v);
  }
  return out;
}

export async function* fromArray(rows: Rec[]): AsyncGenerator<Rec> {
  for (const r of rows) yield r;
}

/* cell parsers: nflverse writes missing values as empty strings or NA */
export const num = (s: string | undefined): number | null => {
  if (s === undefined || s === '' || s === 'NA') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
export const int = (s: string | undefined): number => num(s) ?? 0;
export const flag = (s: string | undefined): boolean => s === '1' || s === 'TRUE' || s === 'true' || s === '1.0';
export const str = (s: string | undefined): string | null => (s === undefined || s === '' || s === 'NA' ? null : s);
