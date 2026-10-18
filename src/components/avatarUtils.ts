/* Pure helpers for Avatar. */

/** Sleeper's CDN thumbnail for a player id (the owner's explicit choice; see docs/WEB_APP_NOTES.md). */
export const HEADSHOT_URL = (pid: string) => `https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(pid)}.jpg`;

/** "justin jefferson" -> "jj", "d.k. metcalf" -> "dm"; one word -> its first two letters. */
export function initialsOf(name: string): string {
  const words = name.replace(/[.'’]/g, ' ').split(/[\s-]+/).filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  // drop a generational suffix so "kenneth walker iii" reads "kw"
  const last = /^(jr|sr|ii|iii|iv|v)$/i.test(words[words.length - 1]!) && words.length > 2 ? words[words.length - 2]! : words[words.length - 1]!;
  return (words[0]![0]! + last[0]!).toUpperCase();
}

