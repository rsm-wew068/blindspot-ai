import json
import unittest
from unittest.mock import Mock, patch
from dataclasses import asdict
from model_output import parse_object, request_validated, InvalidProposal
from simulation import Scenario
from improvement import improve, evaluate
from controller_settings import baseline


def response(value, finish='stop'):
    return {'choices':[{'finish_reason':finish,'message':{'content':value}}],'usage':{'total_tokens':10}}

class ModelOutputTests(unittest.TestCase):
    def test_fenced_json_is_validated_but_truncated_nonfinite_and_prose_are_rejected(self):
        self.assertEqual(parse_object(response('```json\n{"x":1}\n```')),{'x':1})
        for content,finish in [('{"x":1}','length'),('{"x":NaN}','stop'),('Explanation: {"x":1}','stop'),('[]','stop')]:
            with self.subTest(content=content),self.assertRaises(InvalidProposal):parse_object(response(content,finish))

    def test_scenario_repair_is_bounded_and_records_failed_usage(self):
        call=Mock(side_effect=[response('{','length'),response('{"x":1}')])
        result,usage=request_validated(call,{'messages':[]},lambda x:x)
        self.assertEqual(result,{'x':1});self.assertEqual(call.call_count,2)
        self.assertEqual(usage['total_tokens'],20)
        self.assertFalse(usage['requests'][0]['valid'])
        self.assertIn('token limit',call.call_args.args[1]['messages'][-1]['content'])
        with self.assertRaises(InvalidProposal):request_validated(Mock(return_value=response('bad')),{'messages':[]},lambda x:x)

    def test_invalid_adjustment_consumes_slot_then_recovers(self):
        report=evaluate(Scenario(),baseline(Scenario()));report.update(hypothesis='h',rationale='r')
        with patch('improvement.choose_model',return_value='test'),patch('improvement.propose_and_test',side_effect=[InvalidProposal('Bad JSON',{'total_tokens':12}),report,report]) as call:
            result=improve({'scenario':asdict(Scenario())})
        self.assertEqual(call.call_count,3)
        self.assertEqual(result['failed_requests'][0]['request'],1)
        self.assertEqual(result['attempts'][0]['attempt_number'],2)
        self.assertEqual(result['total_usage']['total_tokens'],12)
        self.assertIn('validation_error',call.call_args_list[1].args[2][0])

    def test_all_invalid_adjustments_never_exceed_three_calls(self):
        with patch('improvement.choose_model',return_value='test'),patch('improvement.propose_and_test',side_effect=InvalidProposal('Bad JSON')) as call:
            with self.assertRaisesRegex(ValueError,'three requests'):improve({'scenario':asdict(Scenario())})
        self.assertEqual(call.call_count,3)
