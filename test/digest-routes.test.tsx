import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

let runsDir: string;

const configFor = (dir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: dir,
});

const line = (job: string, status: string, at: string, owner = 'lane-07') =>
  JSON.stringify({ at, job, status, owner });

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));

  writeFileSync(
    join(runsDir, '2026-10-27.jsonl'),
    [
      line('lane/sync', 'ok', '2026-10-27T00:00:01+01:00', 'rook'),
      line('rig/rotate-logs', 'ok', '2026-10-27T23:00:02+01:00'),
      line('lane/sync', 'retry', '2026-10-27T01:00:01+01:00', 'rook'),
      line('deploy/preview', 'fail', '2026-10-27T12:00:00+01:00'),
    ].join('\n') + '\n',
  );

  writeFileSync(join(runsDir, '2026-10-26.jsonl'), '');

  writeFileSync(
    join(runsDir, '2026-10-25.jsonl'),
    [line('lane/sync', 'ok', '2026-10-25T00:00:01+01:00', 'rook'), 'not json at all'].join('\n') + '\n',
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('digest page /digest/:night', () => {
  it('answers 200 with a table of the night\'s jobs', async () => {
    const res = await createApp(configFor(runsDir)).request('/digest/2026-10-27');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('rig/rotate-logs');
    expect(html).toContain('deploy/preview');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(configFor(runsDir)).request('/digest/2001-01-01');
    expect(res.status).toBe(404);
  });

  it('answers 200 with "nothing ran" for an empty night', async () => {
    const res = await createApp(configFor(runsDir)).request('/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('answers 200 and reports the bad line, keeping the good rows', async () => {
    const res = await createApp(configFor(runsDir)).request('/digest/2026-10-25');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line(s) did not parse');
    expect(html).toContain('lane/sync');
  });

  it('answers 404 for a date that is not YYYY-MM-DD', async () => {
    const res = await createApp(configFor(runsDir)).request('/digest/not-a-date');
    expect(res.status).toBe(404);
  });
});

describe('digest JSON /api/digest/:night', () => {
  it('answers 200 with night, rows and badLines', async () => {
    const res = await createApp(configFor(runsDir)).request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.night).toBe('2026-10-27');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual([
      'deploy/preview',
      'lane/sync',
      'rig/rotate-logs',
    ]);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(configFor(runsDir)).request('/api/digest/2001-01-01');
    expect(res.status).toBe(404);
  });

  it('answers 200 with empty rows for an empty night', async () => {
    const res = await createApp(configFor(runsDir)).request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: '2026-10-26', rows: [], badLines: 0 });
  });

  it('counts a bad line and keeps the good rows', async () => {
    const res = await createApp(configFor(runsDir)).request('/api/digest/2026-10-25');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['lane/sync']);
  });
});

describe('digest page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const app = createApp(configFor(runsDir));
    const json = await (await app.request('/api/digest/2026-10-27')).json();
    const html = await (await app.request('/digest/2026-10-27')).text();

    const jobs: string[] = json.rows.map((r: { job: string }) => r.job);
    expect(jobs.length).toBeGreaterThan(1);

    const positions = jobs.map((job) => html.indexOf(job));
    positions.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
