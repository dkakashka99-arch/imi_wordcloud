"""Emit only fixed, payload-free admission diagnostic fields from container stderr."""
import json
import sys

CODES = {'disabled', 'unsafe_tls', 'missing_key', 'configuration', 'tls', 'network', 'timeout',
         'invalid_response', 'authorization', 'access', 'quota', 'unavailable', 'request_rejected',
         'model_unavailable', 'safety_or_incomplete', 'empty_generation', 'internal_exception'}
DETAILS = {'HTTP_BODY_LIMIT', 'HTTP_BODY_JSON', 'OAUTH_ENVELOPE', 'MODEL_ENVELOPE', 'CHAT_ENVELOPE',
           'LENGTH', 'REFUSAL_OR_OTHER', 'CONTENT_EMPTY', 'CONTENT_JSON', 'RESULT_SCHEMA', 'NORMALIZED_OUTPUT', 'PROVIDER_QUEUE_DEADLINE'}
for line in sys.stdin:
    try:
        r = json.loads(line)
    except ValueError:
        continue
    if r.get('event') != 'participant_admission_failure':
        continue
    out = {'event': r['event']}
    for key, allowed in [('providerErrorCode', CODES), ('providerErrorDetail', DETAILS),
                         ('stage', {'read-question', 'cache', 'choose-model', 'generate', 'validate', 'save'})]:
        if r.get(key) in allowed:
            out[key] = r[key]
    for key in ['elapsedMs', 'candidateCount', 'requestOutcome']:
        if isinstance(r.get(key), int):
            out[key] = r[key]
    import re
    if re.fullmatch(r'[a-f0-9-]{36}', str(r.get('traceId', ''))):
        out['traceId'] = r['traceId']
    print(json.dumps(out))
