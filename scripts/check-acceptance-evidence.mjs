import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function verifyAcceptance(text) {
  const records = text.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  assert(
    Array.from({ length: 25 }, (_, i) => `admission case ${i + 1}/25: PASS`).every((line) =>
      text.split('\n').includes(line),
    ),
    'Direct 25-case admission regression missing',
  );
  const direct = records.filter((r) => r.event === 'production_admission_direct');
  assert(
    direct.length >= 10 && direct.every((r) => r.verdict === 'allow'),
    'Repeated direct admission controls missing',
  );
  assert(
    records.some(
      (r) => r.event === 'initial_burst' && r.participants === 250 && r.accepted === 250,
    ),
    '250-participant initial burst missing',
  );
  assert(
    records.some(
      (r) => r.event === 'idempotent_replay' && r.replayed === 250 && r.submissions === 250,
    ),
    '250 idempotent replays missing',
  );
  const cases = records.filter((r) => r.event === 'production_semantic_case');
  assert(
    cases.length >= 12 && cases.every((r) => r.pass === true),
    'All semantic scenarios must actually run',
  );
  const summary = records.find((r) => r.event === 'production_semantic_complete');
  assert(
    summary && cases.length === summary.cases,
    'All declared semantic scenarios must be present',
  );
  assert(
    records.some(
      (r) =>
        r.event === 'production_semantic_complete' &&
        r.failures === 0 &&
        r.pending === 0 &&
        r.protectedEventUnchanged === true,
    ),
    'Semantic acceptance incomplete',
  );
  assert(
    records.some((r) => r.event === 'production_outage_acceptance' && r.pass === true),
    'Scoped outage acceptance missing',
  );
  assert(
    records.some((r) => r.event === 'live_classification' && r.verified === true),
    'Live soak classification missing',
  );
  assert(
    records.some(
      (r) =>
        r.event === 'soak_complete' &&
        r.durationSeconds >= 3600 &&
        r.elapsedSeconds >= r.durationSeconds &&
        r.participants === 250 &&
        r.requests > 0 &&
        r.failures === 0 &&
        r.storedSubmissions === 250 &&
        r.storedRequests === 250 &&
        r.getLatency?.samples >= r.requests &&
        r.httpStatusCounts?.['200'] > 0 &&
        Object.entries(r.httpStatusCounts).every(([status]) => Number(status) < 500),
    ),
    'Full 60-minute soak evidence missing',
  );
  assert(
    text.includes('ACCEPTANCE_CHAIN_COMPLETED'),
    'Remote script did not finish the complete chain',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyAcceptance(readFileSync(process.argv[2], 'utf8'));
  console.log('All required production acceptance evidence verified');
}
