import base64
import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch
import hosted
import frontend_assets
from pathlib import Path


class HostedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'BLINDSPOT_PASSWORD':'test-password-long-enough', 'BLINDSPOT_PUBLIC_ORIGIN':'https://example.test', 'BLINDSPOT_DATA_DIR':self.temp.name}, clear=True)
        self.env.start()
        self.frontend = Path(self.temp.name) / 'dist'
        (self.frontend / 'assets').mkdir(parents=True)
        (self.frontend / 'index.html').write_text('<div id="root"></div>')
        (self.frontend / 'assets/street-test.js').write_text('export default 1;' * 10)
        (self.frontend / 'assets/three.module-test.js').write_text('export default 1;' * 10)
        self.assets = patch.object(frontend_assets, 'FRONTEND_ROOT', self.frontend)
        self.assets.start()

    def tearDown(self):
        self.assets.stop()
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
        for path in ('/','/assets/street-test.js','/api/status','/api/jobs/example'):
            self.assertTrue(self.call(path,auth=False)[0].startswith('401'))

    def test_3d_assets_are_served_with_javascript_mime(self):
        for path in ('/assets/street-test.js', '/assets/three.module-test.js'):
            status, headers, body = self.call(path)
            self.assertTrue(status.startswith('200'))
            self.assertIn('text/javascript', headers['Content-Type'])
            self.assertGreater(len(body), 100)
        self.assertTrue(self.call('/.env.local')[0].startswith('404'))
        self.assertTrue(self.call('/assets/../../.env.local')[0].startswith('404'))

    def test_assets_reject_source_files_and_symlinks(self):
        secret = Path(self.temp.name) / 'private.js'
        secret.write_text('not public')
        (self.frontend / 'assets/link.js').symlink_to(secret)
        for path in ('/assets/link.js', '/assets/../index.html', '/src/App.jsx', '/package.json'):
            self.assertTrue(self.call(path)[0].startswith('404'))

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

    def test_highway_simulation_uses_highway_schema(self):
        status,_,body=self.call('/api/simulate','POST',{'scenario':{'kind':'highway'}},origin='https://example.test')
        self.assertTrue(status.startswith('200'))
        result=json.loads(body)
        self.assertEqual(result['reactive']['scenario']['kind'],'highway')
        self.assertIn('lane_changes',result['reactive']['metrics'])

    def test_ai_off_even_with_key(self):
        os.environ['NEBIUS_TOKEN_FACTORY_KEY']='test-key-not-real'
        self.assertFalse(json.loads(self.call('/api/status')[2])['connection']['configured'])
        self.assertTrue(self.call('/api/investigate','POST',{'mode':'ai','budget':12})[0].startswith('403'))

    def test_ai_budget_validated_before_spending(self):
        os.environ.update(NEBIUS_TOKEN_FACTORY_KEY='test-key-not-real',BLINDSPOT_ENABLE_AI='1')
        with patch('hosted.threading.Thread') as thread:
            self.assertTrue(self.call('/api/investigate','POST',{'mode':'ai','budget':48})[0].startswith('400'))
            thread.assert_not_called()

    def test_no_daily_cap_even_with_legacy_limit_configured(self):
        hosted.JOBS.clear()
        os.environ.update(BLINDSPOT_ENABLE_AI='1',BLINDSPOT_AI_DAILY_RUNS='1')
        with patch('hosted.connection',return_value={'configured':True}),patch('hosted.threading.Thread'):
            for i in range(6):
                status,_,body=self.call('/api/improve','POST',{'scenario':{'kind':'highway'}})
                self.assertTrue(status.startswith('202'),status)
                hosted.JOBS[json.loads(body)['job_id']]['status']='done'
        hosted.JOBS.clear()

    def test_export_returns_artifact_without_server_write(self):
        payload={'artifact':{'scenario':{'speed_kmh':30}},'name':'example.json'}
        status,_,body=self.call('/api/export','POST',payload)
        self.assertTrue(status.startswith('200'))
        self.assertEqual(json.loads(body)['download'],payload['artifact'])

    def test_improvement_retains_enablement_validation_and_concurrency(self):
        hosted.JOBS.clear()
        payload={'scenario':{'kind':'highway'},'concern':'Missed exit'}
        self.assertTrue(self.call('/api/improve','POST',payload)[0].startswith('403'))
        os.environ['BLINDSPOT_ENABLE_AI']='1'
        with patch('hosted.connection',return_value={'configured':True}),patch('hosted.threading.Thread') as thread:
            self.assertTrue(self.call('/api/improve','POST',{'scenario':{'kind':'highway','speed_kmh':999}})[0].startswith('400'))
            thread.assert_not_called()
            self.assertTrue(self.call('/api/improve','POST',payload)[0].startswith('202'))
            self.assertEqual(thread.call_args.kwargs['args'][1]['task'],'improve')
            self.assertTrue(self.call('/api/improve','POST',payload)[0].startswith('409'))
        hosted.JOBS.clear()


if __name__=='__main__':
    unittest.main()
