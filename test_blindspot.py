import json
import math
import os
import unittest
from dataclasses import asdict, replace
from unittest.mock import patch

import investigation
from investigation import counterfactuals, investigate
from simulation import Scenario, compare, control, intersects_box, observe, run


class SimulationTests(unittest.TestCase):
    def test_invalid_and_unknown_inputs_are_rejected(self):
        for data in ({"speed_kmh": float("nan")}, {"speed_kmh": True}, {"van_gap": -1},
                     {"pedestrian": "false"}, {"model_instruction": "change results"}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                Scenario.parse(data)

    def test_hidden_pedestrian_is_not_in_observation(self):
        present = Scenario()
        absent = replace(present, pedestrian=False)
        for t in (0, 0.5, 1):
            x = t * present.speed_kmh / 3.6
            self.assertEqual(observe(present, x, 12.5, t), observe(absent, x, 12.5, t))
        for policy in ("reactive", "cautious"):
            self.assertEqual(control(observe(present, 0, 12.5, 0), policy, 12.5, 6, .3),
                             control(observe(absent, 0, 12.5, 0), policy, 12.5, 6, .3))

    def test_visibility_changes_with_geometry(self):
        self.assertIsNone(observe(Scenario(), 0, 12.5, 0)["pedestrian"])
        self.assertIsNotNone(observe(Scenario(), 44, 12.5, 0)["pedestrian"])

    def test_swept_collision_catches_crossing_between_frames(self):
        self.assertTrue(intersects_box((-5, 0), (5, 0), [-2.4, -1.2, 2.4, 1.2]))
        self.assertFalse(intersects_box((-5, 2), (5, 2), [-2.4, -1.2, 2.4, 1.2]))

    def test_no_pedestrian_has_no_collision_or_fabricated_clearance(self):
        result = compare(replace(Scenario(), pedestrian=False))
        for r in result.values():
            self.assertFalse(r["metrics"]["collision"])
            self.assertTrue(r["metrics"]["finished"])
            self.assertIsNone(r["metrics"]["min_clearance_m"])
            self.assertIsNone(r["metrics"]["first_seen_s"])
        # Reactive car cruises 57 m without any braking.
        self.assertAlmostEqual(result["reactive"]["metrics"]["duration_s"], 57/12.5, delta=.026)
        self.assertIsNone(result["reactive"]["metrics"]["first_brake_s"])
        self.assertGreater(result["cautious"]["metrics"]["duration_s"], result["reactive"]["metrics"]["duration_s"])

    def test_recorded_case_replays_exactly_after_json_roundtrip(self):
        original = run(Scenario())
        restored = Scenario.parse(json.loads(json.dumps(original))["scenario"])
        self.assertEqual(original, run(restored))
        self.assertNotEqual(original["id"], run(replace(restored, speed_kmh=40))["id"])

    def test_braking_waits_for_visibility_and_latency(self):
        metrics = run(Scenario())["metrics"]
        self.assertAlmostEqual(metrics["first_brake_s"] - metrics["first_seen_s"], .3, places=6)

    def test_physics_does_not_reverse_or_exceed_cruise(self):
        for speed in (15, 65):
            for policy in ("reactive", "cautious"):
                r = run(replace(Scenario(), speed_kmh=speed), policy)
                xs = [f["x"] for f in r["frames"]]
                self.assertEqual(xs, sorted(xs))
                self.assertTrue(all(0 <= f["v"] <= speed/3.6+.0001 for f in r["frames"]))

    def test_counterfactual_changes_only_one_input(self):
        s = Scenario()
        results = counterfactuals(s, "reactive")
        for row in results["interventions"]:
            different = [k for k,v in row["scenario"].items() if v != asdict(s)[k]]
            self.assertEqual(different, [row["change"]])


class InvestigationTests(unittest.TestCase):
    def test_seeded_search_and_controller_pairing(self):
        one, two = investigate("random",17,12), investigate("random",17,12)
        self.assertEqual(one["rows"],two["rows"])
        self.assertIsNone(one["model"])
        for row in one["rows"]:
            s = Scenario.parse(row["scenario"])
            for policy in ("reactive", "cautious"):
                self.assertEqual(row[policy],run(s,policy,False)["metrics"])

    def test_no_credentials_never_fakes_ai(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError,"not connected"):
                investigate("ai",17,6)

    def test_ai_receives_previous_measured_results(self):
        histories = []
        def proposals(model, concern, history, count):
            histories.append(json.loads(json.dumps(history)))
            return [Scenario() for _ in range(count)], "Mock proposal for testing only", {}
        with patch.object(investigation,"choose_model",return_value="nvidia/test-nemotron"), patch.object(investigation,"propose",side_effect=proposals):
            result = investigate("ai",17,12)
        self.assertEqual(len(histories[0]),0)
        self.assertEqual(len(histories[1]),6)
        self.assertEqual(histories[1][0]["reactive"],run(Scenario(),replay=False)["metrics"])
        self.assertEqual(result["unique_scenarios"],1)

    def test_model_cannot_set_outcome_or_execute_code(self):
        malicious = {"scenarios":[{"collision":False,"code":"print('bad')"}]*4,"hypothesis":"test"}
        with patch.object(investigation,"api",return_value={"choices":[{"message":{"content":json.dumps(malicious)}}]}):
            with self.assertRaisesRegex(ValueError,"invalid scenario batch"):
                investigation.propose("nvidia/test", "test", [], 4)

    def test_search_budget_is_bounded(self):
        for budget in (0,49,True,4.2):
            with self.assertRaises(ValueError):
                investigate("random",17,budget)


if __name__ == "__main__":
    unittest.main()
