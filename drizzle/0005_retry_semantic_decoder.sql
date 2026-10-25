-- Retry retained answers with the corrected ID-based decoder. Never delete originals.
UPDATE semantic_queue SET status='pending',available_at=now(),error=NULL WHERE status='review' OR (status='pending' AND error='invalid_response');
