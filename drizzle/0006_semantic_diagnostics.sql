ALTER TABLE semantic_queue ADD COLUMN error_detail text;
-- Do not alter categories or original answers of the real 27 October event.
UPDATE semantic_queue sq SET status='review',error='protected_event',error_detail='EXCLUDED_FROM_REPROCESSING' FROM questions q JOIN events e ON e.id=q.event_id WHERE sq.question_id=q.id AND e.slug='mir-27-oct' AND sq.status='pending';
