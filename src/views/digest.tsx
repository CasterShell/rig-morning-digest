import type { Night } from '../digest/types.js';

const dash = '—';

export function DigestPage({ night }: { night: Night }) {
  const bad =
    night.badLines > 0 ? <p class="mute">{night.badLines} line(s) did not parse</p> : null;
  if (night.rows.length === 0) {
    return (
      <>
        <h1>digest {night.night}</h1>
        <p class="mute">nothing ran</p>
        {bad}
      </>
    );
  }
  return (
    <>
      <h1>digest {night.night}</h1>
      <table>
        <thead>
          <tr>
            <th>job</th>
            <th>owner</th>
            <th>runs</th>
            <th>retries</th>
            <th>last status</th>
            <th>last error</th>
            <th>first</th>
            <th>last</th>
          </tr>
        </thead>
        <tbody>
          {night.rows.map((r) => (
            <tr class={r.retries >= 3 || r.fails > 0 ? 'warn' : undefined}>
              <td>{r.job}</td>
              <td>{r.owner ?? dash}</td>
              <td>{r.runs}</td>
              <td>{r.retries}</td>
              <td>{r.lastStatus}</td>
              <td>{r.lastError ?? dash}</td>
              <td>{r.firstAt}</td>
              <td>{r.lastAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {bad}
    </>
  );
}
