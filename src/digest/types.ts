/** One job's night, folded from its lines in `runs/<night>.jsonl`. */
export type DigestRow = {
  job: string;
  owner: string | null;
  /** Log lines for the job. */
  runs: number;
  /** Lines with status retry. */
  retries: number;
  /** Lines with status fail. The ok count is `runs - retries - fails`. */
  fails: number;
  lastStatus: 'ok' | 'retry' | 'fail';
  /** The last error seen for the job, even if the last status is ok. */
  lastError: string | null;
  /** Raw `at` string from the log, offset kept. Never convert to UTC. */
  firstAt: string;
  /** Raw `at` string from the log, offset kept. Never convert to UTC. */
  lastAt: string;
};

export type Night = {
  night: string;
  /** Sorted by job with a plain code-unit compare, not locale compare. */
  rows: DigestRow[];
  /** Lines that did not parse. Counted, never thrown. */
  badLines: number;
};

/**
 * Reads `<runsDir>/<night>.jsonl`. Returns null when there is no such file or `night` is not
 * `YYYY-MM-DD`. The function lives in `src/digest/reader.ts`.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
