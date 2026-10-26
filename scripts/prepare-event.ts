// Explicit one-time operation, never part of migrations or normal deployment.
import { database } from '../src/db/client';
import { eventCommand, listEvents } from '../src/lib/admin/events';
const keepSlug = process.argv[process.argv.indexOf('--keep') + 1];
if (!process.argv.includes('--keep') || !keepSlug) throw new Error('Specify --keep <event-slug>');
try {
  const events = await listEvents();
  const keep = events.find((e) => e.slug === keepSlug);
  if (!keep) throw new Error('Preserved event must exist; nothing changed');
  console.log(
    JSON.stringify({
      keep: { id: keep.id, slug: keep.slug, title: keep.title },
      clearAnswers: keep.answerCount,
      delete: events.filter((e) => e.id !== keep.id).map((e) => ({ id: e.id, title: e.title })),
    }),
  );
  if (process.argv.includes('--apply')) {
    await eventCommand(keep.id, { action: 'clearAnswers', confirmTitle: keep.title });
    for (const e of events.filter((e) => e.id !== keep.id))
      await eventCommand(e.id, { action: 'deleteEvent', confirmTitle: e.title });
    const remaining = await listEvents();
    if (remaining.length !== 1 || remaining[0].id !== keep.id || remaining[0].answerCount !== 0)
      throw new Error('Concurrent changes detected; inspect event list');
    console.log('Verified: one preserved event, zero answers.');
  } else console.log('Dry run only. Add --apply after checking the preserved event and backup.');
} finally {
  await database().end();
}
