"""Offline audit of an existing AI run. Never imports credentials or calls a model."""
import argparse
import hashlib
import json
import random
import statistics
from dataclasses import asdict, replace
from pathlib import Path

from investigation import random_scenario, systematic_scenario
from simulation import VERSION, Scenario, compare

POLICIES = ('reactive', 'cautious')


def measure(scenarios):
    rows = []
    for s in scenarios:
        pair = compare(s, replay=False)
        rows.append({'id': pair['reactive']['id'], 'scenario': asdict(s),
                     **{p: pair[p]['metrics'] for p in POLICIES}})
    return rows


def summarize(rows):
    result = {}
    for p in POLICIES:
        failed = [r for r in rows if r[p]['collision']]
        result[p] = {
            'collisions': len(failed),
            'unique_failure_inputs': len({r['id'] for r in failed}),
            'first_failure_test': next((i+1 for i,r in enumerate(rows) if r[p]['collision']), None),
            'completed': sum(r[p]['finished'] for r in rows),
            'hard_brakes': sum(r[p]['hard_brakes'] for r in rows),
        }
    return result


def replay_recorded(recorded):
    if recorded['version'] != VERSION:
        raise ValueError('Recorded simulator version differs from current version.')
    rows = measure([Scenario.parse(r['scenario']) for r in recorded['rows']])
    if len(rows) != recorded['budget']:
        raise ValueError('Recorded budget does not match row count.')
    for i,(fresh,old) in enumerate(zip(rows, recorded['rows']),1):
        if fresh['id'] != old['id'] or any(fresh[p] != old[p] for p in POLICIES):
            raise ValueError(f'Recorded case {i} no longer reproduces exactly.')
    return rows


def distribution(runs, policy, ai_score):
    counts=[r['summary'][policy]['unique_failure_inputs'] for r in runs]
    return {'runs':len(runs), 'mean_unique_failure_inputs':statistics.mean(counts),
            'median_unique_failure_inputs':statistics.median(counts),
            'min':min(counts), 'max':max(counts),
            'runs_matching_or_exceeding_recorded_ai':sum(n>=ai_score for n in counts),
            'runs_with_no_failure':sum(n==0 for n in counts)}


def build_report(source, seeds=range(100)):
    artifact=json.loads(source.read_text())
    rows=replay_recorded(artifact['ai'])
    budget=len(rows)
    ai=summarize(rows)
    baselines={}
    for name,pedestrian_only in [('random',False),('random_pedestrian_only',True)]:
        runs=[]
        for seed in seeds:
            rng=random.Random(seed)
            scenarios=[random_scenario(rng) for _ in range(budget)]
            if pedestrian_only:
                scenarios=[replace(s,pedestrian=True) for s in scenarios]
            cases=measure(scenarios)
            runs.append({'seed':seed, 'summary':summarize(cases), 'rows':cases})
        baselines[name]={'runs':runs, 'distribution':{p:distribution(runs,p,ai[p]['unique_failure_inputs']) for p in POLICIES}}
    systematic=measure([systematic_scenario(i,budget) for i in range(budget)])
    fixed=[r for r in rows if r['reactive']['collision'] and not r['cautious']['collision']]
    regressions=[r for r in rows if not r['reactive']['collision'] and r['cautious']['collision']]
    return {'version':VERSION,'protocol':'offline-audit-v1','source':source.name,
            'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'simulator_sha256':hashlib.sha256(Path(__file__).with_name('simulation.py').read_bytes()).hexdigest(),
            'budget_per_run':budget,'new_ai_calls':0,'independent_ai_runs':1,
            'ai_pedestrian_cases':sum(r['scenario']['pedestrian'] for r in rows),
            'recorded_ai':{'summary':ai,'rows':rows},'baselines':baselines,
            'systematic':{'summary':summarize(systematic),'rows':systematic},
            'controller_comparison':{'reactive_failures_avoided_by_cautious':[r['id'] for r in fixed],
                                     'new_failures_under_cautious':[r['id'] for r in regressions]},
            'limitations':[
                'One historical AI run, not repeated independent AI trials. No general superiority claim or significance test.',
                'Equal scenario budget, not equal compute time, inference cost, or wall-clock budget.',
                'Unique input hashes are not distinct behavioral failure categories.',
                'Both controllers are internal handwritten baselines; no external driving policy is evaluated.',
                'The cautious controller already existed; this is a comparison, not a newly discovered repair.',
                'These inspected inputs are regression evidence, not a held-out validation set.',
                'This simple simulation does not establish real-world driving safety.']}


def markdown(report):
    lines=['# BlindSpot evidence audit','',
           'Replayed the recorded Nemotron run exactly; made no new model calls. Each search run has '
           +str(report['budget_per_run'])+' scenarios, each evaluated against both controllers.','',
           '| Search | Runs | Reactive unique failure inputs | Cautious unique failure inputs |',
           '|---|---:|---:|---:|']
    ai=report['recorded_ai']['summary']
    lines.append(f"| Recorded Nemotron | 1 | {ai['reactive']['unique_failure_inputs']} | {ai['cautious']['unique_failure_inputs']} |")
    for name,base in report['baselines'].items():
        d=base['distribution'];a=d['reactive'];b=d['cautious']
        lines.append(f"| {name} | {len(base['runs'])} | {a['mean_unique_failure_inputs']:.2f} mean ({a['min']}–{a['max']}) | {b['mean_unique_failure_inputs']:.2f} mean ({b['min']}–{b['max']}) |")
    s=report['systematic']['summary']
    lines.append(f"| Fixed systematic | 1 | {s['reactive']['unique_failure_inputs']} | {s['cautious']['unique_failure_inputs']} |")
    lines+=['','All recorded AI inputs include a pedestrian. The pedestrian-only random baseline controls for that difference.', '']
    for name,base in report['baselines'].items():
        for p in POLICIES:
            d=base['distribution'][p]
            lines.append(f"- {name}, {p}: {d['runs_matching_or_exceeding_recorded_ai']} of {d['runs']} runs matched or exceeded the recorded AI failure count.")
    c=report['controller_comparison']
    lines+=['','## Controller comparison','',f"Switching to the existing cautious controller avoided {len(c['reactive_failures_avoided_by_cautious'])} reactive collisions and introduced {len(c['new_failures_under_cautious'])} collisions on previously non-colliding inputs in the recorded AI batch.",
            'This is not a new controller fix. Full metrics, including hard braking and completion, are in the JSON report.',
            '', '## Limits','']+['- '+x for x in report['limitations']]
    lines+=['','## Next evidence required','',
            '1. Integrate a separately developed policy with documented source, license, and sensor assumptions. Do not label our baselines independent.',
            '2. Freeze the prompt, scenario distribution, policies, budgets, and success metrics before collecting multiple independent AI runs; retain failed API attempts and token usage.',
            '3. Diagnose one failure, implement a controller change, and evaluate both regressions and a fresh, previously unused validation suite.',
            '','Reproduce: `python3 benchmark.py` (offline). Detailed results: `examples/benchmark-audit.json`.','']
    return '\n'.join(lines)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=Path('examples/live-smoke-20260926.json'))
    parser.add_argument('--output',type=Path,default=Path('examples/benchmark-audit.json'))
    parser.add_argument('--report',type=Path,default=Path('BENCHMARK.md'))
    args=parser.parse_args()
    report=build_report(args.source)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+'\n')
    args.report.write_text(markdown(report))
    print(markdown(report))
