import copy
import json
import unittest
from pathlib import Path
from benchmark import replay_recorded, summarize
from simulation import Scenario, compare


class BenchmarkTests(unittest.TestCase):
    def test_duplicate_failure_inputs_do_not_inflate_unique_score(self):
        pair=compare(Scenario(),replay=False)
        row={'id':pair['reactive']['id'],'reactive':pair['reactive']['metrics'],'cautious':pair['cautious']['metrics']}
        result=summarize([row,row])
        self.assertEqual(result['reactive']['collisions'],2)
        self.assertEqual(result['reactive']['unique_failure_inputs'],1)
        self.assertEqual(result['reactive']['first_failure_test'],1)

    def test_recorded_metrics_must_match_recomputed_outcomes(self):
        recorded=json.loads((Path(__file__).parent/'examples/live-smoke-20260926.json').read_text())['ai']
        self.assertEqual(len(replay_recorded(recorded)),12)
        altered=copy.deepcopy(recorded)
        altered['rows'][0]['reactive']['collision']=not altered['rows'][0]['reactive']['collision']
        with self.assertRaisesRegex(ValueError,'no longer reproduces'):
            replay_recorded(altered)

    def test_no_failure_is_censored_not_zero_tests(self):
        pair=compare(Scenario(pedestrian=False),replay=False)
        row={'id':pair['reactive']['id'],'reactive':pair['reactive']['metrics'],'cautious':pair['cautious']['metrics']}
        self.assertIsNone(summarize([row])['reactive']['first_failure_test'])

if __name__=='__main__':
    unittest.main()
