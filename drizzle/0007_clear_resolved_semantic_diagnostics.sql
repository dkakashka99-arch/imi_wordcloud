-- Serialize the model upgrade before taking queue-row locks.
SELECT pg_advisory_xact_lock(714021,4);
-- Successful negative classifications must not retain an obsolete model error.
UPDATE semantic_queue SET error_detail=NULL WHERE status='review' AND error='no_equivalent';
-- One retry epoch for the upgraded classifier; never change the real event.
UPDATE semantic_queue sq SET status='pending',attempts=0,available_at=now()+interval '30 seconds',error=NULL,error_detail=NULL
FROM questions q JOIN events e ON e.id=q.event_id
WHERE sq.question_id=q.id AND NOT e.archived AND e.slug!='mir-27-oct'
AND e.slug NOT LIKE 'semantic-acceptance-%' AND e.slug NOT LIKE 'acceptance-%'
AND sq.status='review' AND sq.error IN ('no_equivalent','invalid_mapping','empty_generation','invalid_response');
