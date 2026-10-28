import json
import math
import unittest
from copy import deepcopy
from dataclasses import asdict
from unittest.mock import patch
from controller_settings import baseline, validate
from highway import HighwayScenario, run as highway_run
from simulation import Scenario, run as street_run
from improvement import improve, evaluate, verdict, compact_report, replay_report

class ImprovementTests(unittest.TestCase):
    def test_original_settings_preserve_existing_physics(self):
        for s, run in [(HighwayScenario(exit_distance_m=950),highway_run),(Scenario(),street_run)]:
            a,b=run(s),run(s,controller=baseline(s))
            for key in ('metrics','events','frames','scenario'):self.assertEqual(a[key],b[key])
            self.assertNotEqual(a['id'],b['id'])

    def test_same_conditions_and_real_parameter_effect(self):
        s=Scenario()
        settings={'caution_distance_m':40,'caution_speed_factor':.4,'visible_margin_m':10}
        report=evaluate(s,settings)
        self.assertEqual(report['original']['scenario'],report['proposed']['scenario'])
        self.assertNotEqual(report['original']['frames'],report['proposed']['frames'])
        self.assertEqual(report['proposed']['controller'],settings)
        self.assertEqual(len(report['regressions']),6)
        self.assertEqual(sum(report['regression_counts'].values()),6)
        # Pedestrian trajectory is fixed despite changed vehicle motion.
        before={f['t']:f['ped_y'] for f in report['original']['frames']}
        for frame in report['proposed']['frames']:
            if frame['t'] in before:self.assertEqual(frame['ped_y'],before[frame['t']])

    def test_highway_traffic_is_identical_at_matching_times(self):
        s=HighwayScenario(exit_distance_m=950, speed_kmh=115, traffic_kmh=85,speed_variation=23,spacing_m=85,aggressiveness=.9)
        report=evaluate(s,{'exit_prepare_m':600,'lane_cooldown_s':6,'speed_gain_mps':3.5})
        self.assertNotEqual(report['original']['frames'],report['proposed']['frames'])
        before={f['t']:{c['id']:c['x'] for c in f['traffic']} for f in report['original']['frames']}
        for f in report['proposed']['frames']:
            for car in f['traffic']:
                if car['id'] in before.get(f['t'],{}):self.assertEqual(car['x'],before[f['t']][car['id']])

    def test_unfixable_exit_is_not_reported_as_fixed(self):
        report=evaluate(HighwayScenario(exit_distance_m=10),{'exit_prepare_m':1000,'lane_cooldown_s':6,'speed_gain_mps':8})
        self.assertTrue(report['proposed']['metrics']['missed_exit'])
        self.assertNotEqual(report['case_verdict'],'improved')

    def test_verdict_reports_regression_and_tradeoff(self):
        a={'collision':False,'finished':True,'duration_s':10,'lane_changes':4,'direction_reversals':2,'hard_brakes':0}
        self.assertEqual(verdict(a,{**a,'collision':True,'finished':False,'duration_s':2}),'worse')
        self.assertEqual(verdict(a,{**a,'lane_changes':2,'duration_s':14}),'mixed')
        self.assertEqual(verdict(a,a),'unchanged')
        self.assertEqual(verdict(a,{**a,'lane_changes':2}),'improved')

    def test_report_recomputes_without_ai_and_detects_tampering(self):
        report=compact_report(evaluate(Scenario(),{'caution_distance_m':30,'caution_speed_factor':.5,'visible_margin_m':8}))
        self.assertNotIn('frames',report['proposed'])
        with patch('improvement.api',side_effect=AssertionError('No inference allowed')):
            self.assertEqual(replay_report(report)['proposed']['metrics'],report['proposed']['metrics'])
            from replay import recompute
            self.assertEqual(len(recompute(report)),1)
        report['proposed']['metrics']['duration_s']+=1
        with self.assertRaises(ValueError):replay_report(report)

    def test_ai_receives_measured_evidence_not_client_metrics(self):
        settings={'caution_distance_m':35,'caution_speed_factor':.4,'visible_margin_m':10}
        def provider(path,payload):
            evidence=json.loads(payload['messages'][1]['content'])
            self.assertEqual(evidence['metrics'],street_run(Scenario(),replay=False)['metrics'])
            self.assertIn('events',evidence)
            return {'choices':[{'message':{'content':json.dumps({'hypothesis':'Late braking may contribute','rationale':'Slow before the obstruction','settings':settings})}}], 'usage':{'total_tokens':1}}
        with patch('improvement.choose_model',return_value='test'),patch('improvement.api',side_effect=provider) as api:
            result=improve({'scenario':asdict(Scenario()),'metrics':{'collision':False}})
            self.assertEqual(api.call_count,1)
            self.assertEqual(result['proposed_settings'],settings)
            self.assertEqual(result['model'],'test')

    def test_invalid_proposals_never_run(self):
        for values in [dict(baseline(Scenario()),caution_distance_m=46),dict(baseline(Scenario()),caution_distance_m=math.nan),dict(baseline(Scenario()),visible_margin_m=True),{'code':'anything'}]:
            with self.subTest(values=values):
                reply={'choices':[{'message':{'content':json.dumps({'hypothesis':'x','rationale':'y','settings':values})}}]}
                with patch('improvement.choose_model',return_value='test'),patch('improvement.api',return_value=reply),patch('improvement.evaluate') as evaluation:
                    with self.assertRaises(ValueError):improve({'scenario':asdict(Scenario())})
                    evaluation.assert_not_called()
