import { expect, it } from 'vitest';
import { verifyAcceptance } from '../../scripts/check-acceptance-evidence.mjs';
const records = [
  ...Array.from({ length: 12 }, () => ({ event: 'production_semantic_case', pass: true })),
  { event: 'production_semantic_complete', failures: 0, pending: 0, protectedEventUnchanged: true },
  { event: 'production_outage_acceptance', pass: true },
  { event: 'live_classification', verified: true },
  {
    event: 'soak_complete',
    durationSeconds: 3600,
    elapsedSeconds: 3601,
    participants: 250,
    requests: 112500,
    failures: 0,
  },
];
const log = (rows: unknown[]) =>
  rows.map((r) => JSON.stringify(r)).join('\n') + '\nACCEPTANCE_CHAIN_COMPLETED';
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
