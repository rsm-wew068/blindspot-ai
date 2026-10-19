"""Recompute exported street cases or highway investigation rows without inference."""
import argparse
import json
from pathlib import Path
from simulation import VERSION, Scenario, compare
from highway import VERSION as HIGHWAY_VERSION, HighwayScenario, compare as compare_highway


def recompute(data):
    cases = data.get('rows') if 'rows' in data else [data]
    if not isinstance(cases, list) or not cases:
        raise ValueError('No recorded cases found.')
    results = []
    for case in cases:
        highway = case['scenario'].get('kind') == 'highway'
        version = HIGHWAY_VERSION if highway else VERSION
        if data.get('version', version) != version:
            raise ValueError('Simulator version mismatch. Use the version recorded with the case.')
        result = compare_highway(HighwayScenario.parse(case['scenario']),False) if highway else compare(Scenario.parse(case['scenario']),False)
        for policy, run in result.items():
            recorded = case.get(policy) if 'rows' in data else case.get('results',{}).get(policy,{}).get('metrics')
            if recorded is not None and recorded != run['metrics']:
                raise ValueError('Recorded metrics differ from this replay.')
        results.append(result)
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('case', type=Path)
    args = parser.parse_args()
    try:
        results = recompute(json.loads(args.case.read_text()))
    except ValueError as exc:
        raise SystemExit(str(exc))
    for i, result in enumerate(results,1):
        for policy, run in result.items():
            print(f'Case {i} {policy}: ' + json.dumps(run['metrics']))
    print('Replay complete. Any supplied recorded metrics matched.')
