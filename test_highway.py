import json
import math
import unittest
from dataclasses import asdict
from unittest.mock import patch
from highway import HighwayScenario, compare, traffic
from highway_investigation import investigate, propose, proposal_schema

class HighwayTests(unittest.TestCase):
    def test_replay_and_summary_agree_and_are_deterministic(self):
        scenario=HighwayScenario()
        full=compare(scenario)
        self.assertEqual(full,compare(scenario))
        compact=compare(scenario,False)
        for policy,run in full.items():
            self.assertEqual(run['metrics'],compact[policy]['metrics'])
            self.assertEqual(run['frames'][-1]['t'],run['metrics']['duration_s'])
            self.assertEqual(run['metrics']['lane_changes'],sum(e['kind']=='lane_change' for e in run['events']))
            for frame in run['frames'][::30]:
                expected={c['id']:round(c['x'],3) for c in traffic(scenario,frame['t'])}
                for car in frame['traffic']:self.assertEqual(car['x'],expected[car['id']])
        self.assertGreater(full['reactive']['metrics']['direction_reversals'],0)
        self.assertEqual(full['reactive']['id'],full['cautious']['id'])

    def test_traffic_and_lane_motion_are_continuous(self):
        run=compare(HighwayScenario())['reactive']
        moving=[f for f in run['frames'] if 0.1 < (f['y']/3.6)%1 < .9 and f['x']<950]
        self.assertTrue(moving,'Lane changes must include intermediate lateral positions')
        first,last=run['frames'][0],run['frames'][1]
        by_id={c['id']:c for c in last['traffic']}
        self.assertTrue(all(by_id[c['id']]['x']>c['x'] for c in first['traffic'] if c['id'] in by_id))
        self.assertTrue(run['metrics']['exit_success'])
        self.assertGreater(run['frames'][-1]['y'],7.2)

    def test_initial_traffic_never_overlaps_ego(self):
        for spacing in range(25,91):
            cars=traffic(HighwayScenario(spacing_m=spacing),0)
            self.assertTrue(all(abs(c["x"])>=10 for c in cars if c["lane"]==1))

    def test_exit_aware_can_fail(self):
        pair=compare(HighwayScenario(spacing_m=48),False)
        self.assertTrue(pair['cautious']['metrics']['collision'])
        self.assertFalse(pair['cautious']['metrics']['exit_success'])

    def test_invalid_scenarios_rejected(self):
        for data in [{'speed_kmh':math.nan},{'spacing_m':True},{'kind':'crosswalk'},{'traffic_phase':31},{'pedestrian':True}]:
            with self.subTest(data=data),self.assertRaises(ValueError):HighwayScenario.parse(data)

    def test_random_search_replays_exact_inputs(self):
        result=investigate('random',17,4)
        self.assertEqual(result,investigate('random',17,4))
        from replay import recompute
        self.assertEqual(len(recompute(result)), 4)
        for row in result['rows']:
            pair=compare(HighwayScenario.parse(row['scenario']),False)
            self.assertEqual(row['reactive'],pair['reactive']['metrics'])

    def test_ai_receives_measured_history_and_correct_schema(self):
        def reply(path,payload):
            user=json.loads(payload['messages'][1]['content'])
            self.assertIn('direction_reversals',user['previous_results'][0]['reactive']) if user['previous_results'] else None
            self.assertEqual(payload['response_format']['json_schema']['schema'],proposal_schema(user['count']))
            return {'choices':[{'message':{'content':json.dumps({'hypothesis':'Test waves','scenarios':[asdict(HighwayScenario())]*user['count']})}}]}
        with patch('highway_investigation.choose_model',return_value='nvidia/test'),patch('highway_investigation.api',side_effect=reply) as provider:
            result=investigate('ai',17,12,'Repeated lane switching')
            self.assertEqual(provider.call_count,2)
            self.assertEqual(len(result['rows']),12)
            self.assertEqual(result['scene'],'highway')

    def test_ai_malformed_output_is_not_executed(self):
        bad={'choices':[{'message':{'content':json.dumps({'hypothesis':'bad','scenarios':[{'kind':'highway'}]*6})}}]}
        with patch('highway_investigation.api',return_value=bad),self.assertRaises(ValueError):propose('nvidia/test','',[],6)
