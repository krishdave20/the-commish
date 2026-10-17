/* Node-only: reads reference/fixture/ from disk for tests and scripts. Not exported from index.ts, so it
   never reaches the browser bundle. node: modules are imported dynamically so the app's TypeScript
   program (which has no Node types) stays clean. */
import type { FixtureManifest, FixtureSource } from './transport.ts';

interface NodeFs { readFile(p: string): Promise<Uint8Array>; readFileSync?: never }
interface NodeZlib { gunzipSync(b: Uint8Array): { toString(enc: string): string } }

export async function fixtureDirSource(dir: string): Promise<FixtureSource> {
  const fsName = 'node:fs/promises';
  const zName = 'node:zlib';
  const fs = (await import(/* @vite-ignore */ fsName)) as unknown as NodeFs;
  const zlib = (await import(/* @vite-ignore */ zName)) as unknown as NodeZlib;
  const join = (f: string) => `${dir.replace(/\/$/, '')}/${f}`;
  const manifest = JSON.parse(new TextDecoder().decode(await fs.readFile(join('manifest.json')))) as FixtureManifest;
  return {
    manifest,
    async load(file) {
      return JSON.parse(zlib.gunzipSync(await fs.readFile(join(file))).toString('utf8'));
    },
  };
}
