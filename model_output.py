"""Strict JSON transport parsing and safe, actionable failure diagnostics."""
import json

class InvalidProposal(ValueError):
    def __init__(self, reason, usage=None):
        super().__init__(reason)
        self.usage = usage or {}

def parse_object(response):
    usage = response.get('usage', {}) if isinstance(response, dict) else {}
    try:
        choice = response['choices'][0]
        if choice.get('finish_reason') == 'length':
            raise InvalidProposal('Model output reached the token limit before completion.', usage)
        message = choice['message']
        content = message.get('content')
        if message.get('refusal') or not isinstance(content, str) or not content.strip():
            raise InvalidProposal('Model returned no usable JSON proposal.', usage)
        content = content.strip()
        if content.startswith('```') and content.endswith('```'):
            content = content.split('\n', 1)[1].rsplit('```', 1)[0].strip()
        result = json.loads(content, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        if not isinstance(result, dict): raise ValueError()
        return result
    except InvalidProposal:
        raise
    except (KeyError, IndexError, TypeError, ValueError):
        raise InvalidProposal('Model response was not a complete JSON object.', usage) from None


def request_validated(call, payload, validator):
    """One repair request at most. Never execute partial or coerced proposals."""
    requests = []
    for number in range(2):
        response = call('/chat/completions', payload)
        usage = response.get('usage') or {}
        try:
            parsed = parse_object(response)
            result = validator(parsed)
            requests.append({'request':number+1,'valid':True,'usage':usage})
            totals = {key:sum(r['usage'].get(key,0) for r in requests) for key in ('prompt_tokens','completion_tokens','total_tokens')}
            return result, {**totals,'requests':requests}
        except ValueError as error:
            reason = str(error) if isinstance(error, InvalidProposal) else 'Proposal did not satisfy the required fields, count, types or bounds.'
            requests.append({'request':number+1,'valid':False,'reason':reason,'usage':usage})
            if number:
                raise InvalidProposal('AI proposal failed validation after one repair request. ' + reason, usage) from None
            payload = {**payload,'messages':[*payload['messages'],{'role':'user','content':
                'Validation failed: '+reason+' Return a fresh complete JSON object conforming exactly to the schema. Keep hypothesis under 80 words. No markdown or reasoning text. Do not omit any required fields or scenarios.'}]}
