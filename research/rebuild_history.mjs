// Reconstruct the full paimon.moe timeline archive by walking every historical
// revision of src/data/timeline.js and unioning the events.
//
// Run from the cloned repo's parent:  node rebuild_history.mjs
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const REPO = 'repo';

const shas = execSync(
  `git -C ${REPO} log --format=%H --follow -- src/data/timeline.js`,
  { encoding: 'utf8', maxBuffer: 1 << 28 },
).trim().split('\n');

console.log(`revisions of timeline.js: ${shas.length}`);

// Evaluate a revision's `export const eventsData = [...]` without a bundler.
async function loadRevision(sha) {
  let src;
  try {
    src = execSync(`git -C ${REPO} show ${sha}:src/data/timeline.js`, {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    });
  } catch {
    return null;
  }
  const mod = src.replace(/export\s+const\s+eventsData\s*=/, 'const eventsData =')
    + '\n;export default eventsData;';
  const url = 'data:text/javascript;base64,' + Buffer.from(mod, 'utf8').toString('base64');
  try {
    return (await import(url)).default;
  } catch (e) {
    console.warn(`  !! ${sha.slice(0, 8)} failed to eval: ${e.message.slice(0, 80)}`);
    return null;
  }
}

// Flatten the lane structure; keep the lane index so we can recover the row layout.
function flatten(data, sha, date) {
  const out = [];
  data.forEach((lane, laneIdx) => {
    const items = Array.isArray(lane) ? lane : [lane];
    for (const e of items) {
      if (!e || !e.name || !e.start) continue;
      out.push({ ...e, lane: laneIdx, _sha: sha, _rev: date });
    }
  });
  return out;
}

const seen = new Map();          // key -> event
const fieldUse = new Map();
let evaluated = 0;

for (const sha of shas) {
  const date = execSync(`git -C ${REPO} log -1 --format=%ad --date=short ${sha}`, {
    encoding: 'utf8',
  }).trim();
  const data = await loadRevision(sha);
  if (!data) continue;
  evaluated++;
  for (const e of flatten(data, sha, date)) {
    const key = `${e.name}||${e.start}||${e.end ?? ''}`;
    // keep the newest revision's copy (first one wins: log is newest-first)
    if (!seen.has(key)) seen.set(key, e);
    for (const k of Object.keys(e)) {
      if (k.startsWith('_')) continue;
      fieldUse.set(k, (fieldUse.get(k) ?? 0) + 1);
    }
  }
}

const all = [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));

console.log(`revisions evaluated : ${evaluated}/${shas.length}`);
console.log(`unique events       : ${all.length}`);
console.log(`date range          : ${all[0].start}  ->  ${all[all.length - 1].start}`);
console.log('\nfield frequency across the whole archive:');
for (const [k, v] of [...fieldUse].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}

// How many distinct events per year, and what the lanes look like
const byYear = {};
for (const e of all) (byYear[e.start.slice(0, 4)] ??= []).push(e);
console.log('\nevents per year:');
for (const y of Object.keys(byYear).sort()) {
  console.log(`  ${y}: ${byYear[y].length}`);
}

const names = new Map();
for (const e of all) names.set(e.name, (names.get(e.name) ?? 0) + 1);
console.log('\nmost repeated event names (recurring lanes):');
for (const [n, c] of [...names].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(c).padStart(3)}x  ${n}`);
}

writeFileSync('timeline_archive.json', JSON.stringify(all, null, 2), 'utf8');
console.log(`\nwrote timeline_archive.json (${all.length} events)`);
