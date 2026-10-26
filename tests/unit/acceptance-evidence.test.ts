import { expect, it } from 'vitest';
import { verifyAcceptance } from '../../scripts/check-acceptance-evidence.mjs';
const records = [
  ...Array.from({ length: 14 }, () => ({ event: 'production_admission_direct', verdict: 'allow' })),
  { event: 'initial_burst', participants: 250, accepted: 250 },
  { event: 'idempotent_replay', replayed: 250, submissions: 250 },
  ...Array.from({ length: 12 }, () => ({ event: 'production_semantic_case', pass: true })),
  {
    event: 'production_semantic_complete',
    cases: 12,
    failures: 0,
    pending: 0,
    protectedEventUnchanged: true,
  },
  { event: 'production_outage_acceptance', pass: true },
  { event: 'live_classification', verified: true },
  {
    event: 'soak_complete',
    durationSeconds: 3600,
    elapsedSeconds: 3601,
    participants: 250,
    requests: 112500,
    failures: 0,
    storedSubmissions: 250,
    storedRequests: 250,
    getLatency: { samples: 112500 },
    httpStatusCounts: { '200': 113000 },
  },
];
const log = (rows: unknown[]) =>
  Array.from({ length: 25 }, (_, i) => `admission case ${i + 1}/25: PASS`).join('\n') +
  '\n' +
  rows.map((r) => JSON.stringify(r)).join('\n') +
  '\nACCEPTANCE_CHAIN_COMPLETED';
it('fails closed when Docker stdin consumption skips the remaining acceptance commands', () => {
  expect(() => verifyAcceptance(log(records))).not.toThrow();
  expect(() => verifyAcceptance(log(records.filter((r) => r.event !== 'soak_complete')))).toThrow(
    'soak',
  );
  expect(() => verifyAcceptance(log(records).replace('ACCEPTANCE_CHAIN_COMPLETED', ''))).toThrow(
    'chain',
  );
  expect(() =>
    verifyAcceptance(
      log(records.map((r) => (r.event === 'soak_complete' ? { ...r, elapsedSeconds: 2 } : r))),
    ),
  ).toThrow('soak');
});

it('rejects missing replay evidence and inconsistent stored votes', () => {
  expect(() =>
    verifyAcceptance(log(records.filter((r) => r.event !== 'idempotent_replay'))),
  ).toThrow('replays');
  expect(() =>
    verifyAcceptance(
      log(records.map((r) => (r.event === 'soak_complete' ? { ...r, storedSubmissions: 251 } : r))),
    ),
  ).toThrow('soak');
});
