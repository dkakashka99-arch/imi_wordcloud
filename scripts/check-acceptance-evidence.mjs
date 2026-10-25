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
        r.failures === 0,
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
