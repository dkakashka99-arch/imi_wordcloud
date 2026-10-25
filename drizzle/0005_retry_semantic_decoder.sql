-- Serialize recovery with in-flight semantic workers.
SELECT pg_advisory_xact_lock(714021,4);
-- Retry retained test answers only. The actual 27 October event is protected.
UPDATE semantic_queue sq SET status='pending',attempts=0,available_at=now(),error=NULL FROM questions q JOIN events e ON e.id=q.event_id WHERE sq.question_id=q.id AND e.slug!='mir-27-oct' AND (sq.status='review' OR (sq.status='pending' AND sq.error='invalid_response'));
