import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  /** Per night in `nights`: counts summed over its rows, or null when unreadable. */
  counts: Record<string, NightCounts | null>;
};

export type NightCounts = { ok: number; retry: number; fail: number };

export function nightCounts(runsDir: string, night: string): NightCounts | null {
  try {
    const n = readNight(runsDir, night);
    if (!n) return null;
    let runs = 0, retry = 0, fail = 0;
    for (const r of n.rows) {
      runs += r.runs;
      retry += r.retries;
      fail += r.fails;
    }
    return { ok: runs - retry - fail, retry, fail };
  } catch {
    return null;
  }
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir);
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    counts: Object.fromEntries(nights.map((n) => [n, nightCounts(config.runsDir, n)])),
  };
}
