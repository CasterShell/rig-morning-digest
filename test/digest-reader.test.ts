import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on the real night', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('has 5 jobs in order and 1 bad line', () => {
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps the last error after a recovery', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
    });
  });

  it('counts fails', () => {
    expect(row('notes/backup')).toMatchObject({ fails: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row with no owner', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastError: null });
  });

  it('keeps the raw times, offset included', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });
});

describe('readNight on a temp runs dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  const runsDir = join(dir, 'runs');
  mkdirSync(runsDir);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // Each test gets its own night, so the files don't depend on test order.
  const write = (night: string, text: string) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), text);
    return readNight(runsDir, night);
  };
  const line = (fields: Record<string, unknown>) =>
    JSON.stringify({ at: 't', job: 'a', status: 'ok', ...fields });

  it('gives an empty night for an empty file', () => {
    expect(write('2026-01-01', '')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('gives null for a missing file', () => {
    expect(readNight(runsDir, '2026-01-02')).toBeNull();
    expect(readNight(join(dir, 'nowhere'), '2026-01-02')).toBeNull();
  });

  it('gives null for a bad night name, path traversal included', () => {
    writeFileSync(join(dir, '2026-01-03.jsonl'), line({}));
    writeFileSync(join(runsDir, 'latest.jsonl'), line({}));
    for (const name of [
      '',
      'latest',
      '26-01-03',
      '2026-1-3',
      '2026-01-03.jsonl',
      '2026-01-03\n',
      '../2026-01-03',
      '..\\2026-01-03',
      '2026-01-03/../2026-01-03',
    ]) {
      expect(readNight(runsDir, name), JSON.stringify(name)).toBeNull();
    }
  });

  it('skips blank lines without counting them, with LF or CRLF', () => {
    const night = write('2026-01-04', `\n${line({})}\r\n\r\n   \n${line({})}\n\n`);
    expect(night?.badLines).toBe(0);
    expect(night?.rows[0]?.runs).toBe(2);
  });

  it('counts a truncated last line with no newline', () => {
    const night = write('2026-01-05', `${line({})}\n{"at":"t","job":"a`);
    expect(night?.badLines).toBe(1);
    expect(night?.rows[0]?.runs).toBe(1);
  });

  it('counts a line that parses but does not fit the shape', () => {
    const bad = [
      '5',
      'null',
      '"text"',
      '[]',
      '{}',
      line({ at: 1 }),
      line({ job: null }),
      line({ status: 'skipped' }),
      line({ owner: 7 }),
      line({ error: null }),
      line({ error: 7 }),
    ];
    expect(write('2026-01-06', `${bad.join('\n')}\n`)).toEqual({
      night: '2026-01-06',
      rows: [],
      badLines: bad.length,
    });
  });

  it('takes an absent owner as null and the owner from the last line', () => {
    const night = write(
      '2026-01-07',
      [
        line({ job: 'absent' }),
        line({ job: 'changed', owner: 'first' }),
        line({ job: 'changed', owner: 'second' }),
        line({ job: 'dropped', owner: 'first' }),
        line({ job: 'dropped' }),
      ].join('\n'),
    );
    expect(night?.rows.map((r) => r.owner)).toEqual([null, 'second', null]);
  });

  it('folds in file order, not time order', () => {
    const night = write(
      '2026-01-08',
      [
        line({ at: '2026-01-08T02:00:00+01:00', status: 'retry', error: 'old' }),
        line({ at: '2026-01-08T01:00:00+01:00', status: 'fail', error: 'new' }),
        line({ at: '2026-01-08T00:00:00+01:00' }),
      ].join('\n'),
    );
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 3,
        retries: 1,
        fails: 1,
        lastStatus: 'ok',
        lastError: 'new',
        firstAt: '2026-01-08T02:00:00+01:00',
        lastAt: '2026-01-08T00:00:00+01:00',
      },
    ]);
  });

  it('sorts jobs by code unit, not locale', () => {
    const jobs = ['b', 'a', 'B', 'é', 'A'];
    const night = write('2026-01-09', jobs.map((job) => line({ job })).join('\n'));
    expect(night?.rows.map((r) => r.job)).toEqual(['A', 'B', 'a', 'b', 'é']);
  });
});
