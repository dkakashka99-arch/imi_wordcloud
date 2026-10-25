-- Successful negative classifications must not retain an obsolete model error.
UPDATE semantic_queue SET error_detail=NULL WHERE status='review' AND error='no_equivalent';
