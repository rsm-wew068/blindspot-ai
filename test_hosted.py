import base64
import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch
import hosted


class HostedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'BLINDSPOT_PASSWORD':'test-password-long-enough', 'BLINDSPOT_PUBLIC_ORIGIN':'https://example.test', 'BLINDSPOT_DATA_DIR':self.temp.name}, clear=True)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def call(self, path='/', method='GET', data=None, auth=True, origin=None):
        raw = json.dumps(data).encode() if data is not None else b''
        env = {'PATH_INFO':path,'REQUEST_METHOD':method,'CONTENT_TYPE':'application/json','CONTENT_LENGTH':str(len(raw)),'wsgi.input':io.BytesIO(raw),'HTTP_HOST':'example.test'}
        if auth:
            env['HTTP_AUTHORIZATION']='Basic '+base64.b64encode(b'blindspot:test-password-long-enough').decode()
        if origin:
            env['HTTP_ORIGIN']=origin
        captured=[]
        body=b''.join(hosted.application(env,lambda status,headers:captured.append((status,dict(headers)))))
        return captured[0][0],captured[0][1],body

    def test_health_is_public_but_app_and_jobs_are_private(self):
        self.assertTrue(self.call('/healthz',auth=False)[0].startswith('200'))
        for path in ('/','/app.js','/api/status','/api/jobs/example'):
            self.assertTrue(self.call(path,auth=False)[0].startswith('401'))

    def test_missing_password_fails_closed(self):
        os.environ.pop('BLINDSPOT_PASSWORD')
        self.assertTrue(self.call()[0].startswith('503'))

    def test_foreign_origin_rejected(self):
        self.assertTrue(self.call('/api/simulate','POST',{},origin='https://evil.example')[0].startswith('403'))

    def test_render_origin_works_without_manual_configuration(self):
        os.environ.pop('BLINDSPOT_PUBLIC_ORIGIN')
        os.environ['RENDER_EXTERNAL_URL'] = 'https://blindspot-example.onrender.com'
        self.assertTrue(self.call('/api/simulate','POST',{},origin='https://blindspot-example.onrender.com')[0].startswith('200'))
        self.assertTrue(self.call('/api/simulate','POST',{},origin='https://another.onrender.com')[0].startswith('403'))

    def test_authenticated_simulation_works(self):
        status,_,body=self.call('/api/simulate','POST',{},origin='https://example.test')
        self.assertTrue(status.startswith('200'))
        self.assertIn('reactive',json.loads(body))

    def test_ai_off_even_with_key(self):
        os.environ['NEBIUS_TOKEN_FACTORY_KEY']='test-key-not-real'
        self.assertFalse(json.loads(self.call('/api/status')[2])['connection']['configured'])
        self.assertTrue(self.call('/api/investigate','POST',{'mode':'ai','budget':12})[0].startswith('403'))

    def test_ai_budget_validated_before_spending(self):
        os.environ.update(NEBIUS_TOKEN_FACTORY_KEY='test-key-not-real',BLINDSPOT_ENABLE_AI='1')
        with patch.object(hosted,'reserve_ai_run') as reserve:
            self.assertTrue(self.call('/api/investigate','POST',{'mode':'ai','budget':48})[0].startswith('400'))
            reserve.assert_not_called()

    def test_persistent_daily_allowance(self):
        os.environ['BLINDSPOT_AI_DAILY_RUNS']='2'
        self.assertTrue(hosted.reserve_ai_run())
        self.assertTrue(hosted.reserve_ai_run())
        self.assertFalse(hosted.reserve_ai_run())

    def test_export_returns_artifact_without_server_write(self):
        payload={'artifact':{'scenario':{'speed_kmh':30}},'name':'example.json'}
        status,_,body=self.call('/api/export','POST',payload)
        self.assertTrue(status.startswith('200'))
        self.assertEqual(json.loads(body)['download'],payload['artifact'])


if __name__=='__main__':
    unittest.main()
