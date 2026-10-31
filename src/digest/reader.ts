import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight } from './types.js';

type LogLine = {
  at: string;
  job: string;
  status: DigestRow['lastStatus'];
  owner: string | null;
  error: string | null;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

function isStatus(value: unknown): value is LogLine['status'] {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

// Null for a line that doesn't parse or doesn't fit the shape.
function parseLine(line: string): LogLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;

  return { at, job, status, owner: owner ?? null, error: error ?? null };
}

function foldLine(row: DigestRow | undefined, line: LogLine): DigestRow {
  return {
    job: line.job,
    owner: line.owner,
    runs: (row?.runs ?? 0) + 1,
    retries: (row?.retries ?? 0) + (line.status === 'retry' ? 1 : 0),
    fails: (row?.fails ?? 0) + (line.status === 'fail' ? 1 : 0),
    lastStatus: line.status,
    lastError: line.error ?? row?.lastError ?? null,
    firstAt: row?.firstAt ?? line.at,
    lastAt: line.at,
  };
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readText(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    rows.set(line.job, foldLine(rows.get(line.job), line));
  }

  const result: Night = {
    night,
    rows: [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0)),
    badLines,
  };
  return result;
};
