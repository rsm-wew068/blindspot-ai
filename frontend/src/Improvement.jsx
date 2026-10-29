import { useEffect, useRef, useState } from 'react';
const settingLabels = {
  exit_prepare_m: ['Start preparing for exit', 'm'], lane_cooldown_s: ['Lane-change cooldown', 's'], speed_gain_mps: ['Required speed benefit', 'm/s'],
  caution_distance_m: ['Start slowing near crossing', 'm'], caution_speed_factor: ['Caution speed factor', ''], visible_margin_m: ['Visible-conflict braking margin', 'm'],
};
export default function Improvement({scenario, concern, disabled, connected, request, setBusy, onReplay, connect}) {
  const [investigation, setInvestigation] = useState(null), [report, setReport] = useState(null), [progress, setProgress] = useState(''), [running, setRunning] = useState(false);
  const abort = useRef(null), lock = useRef(false);
  useEffect(() => () => { abort.current?.abort(); }, []);
  async function improve() {
    if (lock.current || disabled) return;
    if (!connected) { connect(); return; }
    lock.current = true; setBusy(true); setRunning(true); setProgress('Measuring this case and requesting an AI proposal…');
    const controller = new AbortController(); abort.current = controller;
    try {
      const job = await request('/api/improve', {scenario, concern}, controller.signal);
      while (!controller.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 650));
        if (controller.signal.aborted) break;
        const state = await request('/api/jobs/' + job.job_id, undefined, controller.signal);
        if (state.status === 'error') throw Error(state.error);
        if (state.status === 'done') {
          setInvestigation(state.result); setReport(state.result); setProgress('Analysis and simulation checks complete.');
          onReplay(state.result, state.result.accepted ? 'cautious' : 'reactive'); break;
        }
        setProgress(state.progress?.message || 'Testing the proposed settings…');
      }
    } catch (error) {
      if (error.name !== 'AbortError') setProgress('Adjustment could not be tested: ' + error.message);
    } finally {
      lock.current = false; setBusy(false); setRunning(false);
    }
  }
  function download() {
    function stripFrames(value) {
      const compact = {...value};
      for (const key of ['original','proposed']) { const {frames, ...rest} = value[key]; compact[key] = rest; }
      if (value.attempts) compact.attempts = value.attempts.map(stripFrames);
      return compact;
    }
    const compact = stripFrames(investigation || report);
    const url = URL.createObjectURL(new Blob([JSON.stringify(compact,null,2)], {type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download='blindspot-controller-adjustment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="panel improvement" aria-label="Analyze and test a controller adjustment">
    <div className="panel-title"><h2>Understand the problem. Test a change.</h2><span className="tag">AI + SIMULATION</span></div>
    <p>Analyze the {scenario.kind === 'highway' ? 'aggressive' : 'reactive'} baseline in the current replay. AI proposes settings, tests the same conditions and six additional cases, then revises using measured results. Up to three attempts.</p>
    <button id="improveBtn" className="primary" disabled={disabled || running} onClick={improve}>{running ? 'Analyzing & testing…' : 'Analyze & test adjustment with AI'}</button>
    <p className="field-help">Up to three AI requests using Nebius credits and one shared daily allowance slot. This does not modify vehicle software.</p>
    {progress && <p role="status">{progress}</p>}
    {report && <div id="improvementReport">
      {investigation?.attempts && <>
        <h3>{investigation.accepted ? 'Candidate found for review' : 'No acceptable adjustment found'}</h3>
        <p>{investigation.conclusion}</p>
        <p>Stopped: {({acceptable_candidate:'current case improved with no measured regressions', budget_exhausted:'three-attempt budget exhausted', repeated_proposal:'AI repeated an already tested configuration', proposal_error:'request budget exhausted after invalid proposals; valid results retained'})[investigation.stop_reason]}.</p>
        {investigation.failed_requests?.length > 0 && <details><summary>{investigation.failed_requests.length} invalid AI response(s) — no simulation executed for those requests</summary><ul>{investigation.failed_requests.map((failure,i)=><li key={i}>Request {failure.request}: {failure.reason}</li>)}</ul></details>}
        <div className="adjustment-actions" role="group" aria-label="Adjustment attempts">{investigation.attempts.map(attempt=><button key={attempt.attempt_number} className="quiet" disabled={disabled} aria-pressed={report.attempt_number === attempt.attempt_number} onClick={()=>{setReport(attempt);onReplay(attempt,'cautious');}}>
          Attempt {attempt.attempt_number}: {attempt.case_verdict}{attempt.attempt_number === investigation.selected_attempt ? ' · selected' : ''}
        </button>)}</div>
        <details><summary>How the selected attempt was chosen</summary><p>{investigation.selection_rule}</p><p>These six cases guide revision, so they are development checks—not independent validation.</p></details>
      </>}
      <h3>Attempt {report.attempt_number || 1} · Measured result: {report.case_verdict}</h3>
      <p>Across this case and six checks: <strong>{report.overall_verdict}</strong>. A proposal is not a proven fix.</p>
      <h3>Observed baseline</h3>
      <p>{report.original.metrics.collision ? 'Collision recorded.' : 'No collision recorded.'} {report.original.metrics.missed_exit ? 'Exit missed.' : ''} {report.original.metrics.direction_reversals !== undefined ? `${report.original.metrics.direction_reversals} lane-direction reversals.` : ''}</p>
      <details><summary>Measured event timeline</summary><ul>{report.original.events.map((event,i)=><li key={i}>{event.t.toFixed(2)} s — {event.text}</li>)}</ul></details>
      {report.engineering_findings?.length > 0 && <><h3>Measured decision trace</h3>
        <ul>{report.engineering_findings.map((finding,i)=><li key={i}>{finding}</li>)}</ul>
        <p className="field-help">Controller observations and decisions, not an AI-generated explanation. Hidden pedestrian positions are not supplied to the controller.</p>
        {['original','proposed'].map(key=><details key={key}><summary>{key === 'original' ? 'Original controller' : 'Proposed adjustment'}: inspect prediction → command → applied braking</summary>
          <div className="table-scroll"><table className="metric-table"><thead><tr><th>Time (s)</th><th>Visible</th><th>Predicted lateral position at arrival (m)</th><th>Conflict</th><th>Requested acceleration (m/s²)</th><th>Applied acceleration (m/s²)</th></tr></thead><tbody>
            {report[key].decision_trace?.map((row,i)=><tr key={i}><td>{row.t.toFixed(3)}</td><td>{row.visible ? 'Yes' : 'No'}</td><td>{row.projected_y == null ? '—' : row.projected_y.toFixed(2)}</td><td>{row.conflict ? 'Yes' : 'No'}</td><td>{row.requested_accel.toFixed(2)}</td><td>{row.applied_accel.toFixed(2)}</td></tr>)}
          </tbody></table></div><p className="field-help">{report[key].trace_summary?.sampling} Negative acceleration means braking.</p>
        </details>)}
      </>}
      {report.proposal_warnings?.length > 0 && <><h3>Proposal limitations detected by the simulator</h3><ul>{report.proposal_warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></>}
      <h3>Verified before / after</h3>
      <p><strong>{report.behavior_changed ? 'Vehicle motion changed.' : 'Vehicle motion is identical.'}</strong> {report.proposed.metrics.collision ? 'The proposed controller still collided; this is not a successful fix.' : 'The proposed controller did not collide in this case.'}</p>
      {report.original.metrics.impact_kmh != null && <p>Impact speed: {report.original.metrics.impact_kmh} km/h → {report.proposed.metrics.impact_kmh == null ? 'No collision' : report.proposed.metrics.impact_kmh + ' km/h'}.</p>}
      <p>Collision: {String(report.original.metrics.collision)} → {String(report.proposed.metrics.collision)}. Run ended at {report.original.metrics.duration_s} s → {report.proposed.metrics.duration_s} s.</p>
      {report.original.trace_summary && <div className="table-scroll"><table className="metric-table"><thead><tr><th>Measured signal</th><th>Original (s)</th><th>Proposed (s)</th></tr></thead><tbody>
        {[['Conflict detected','first_conflict_s'],['Braking requested','first_requested_brake_s'],['Braking applied','first_applied_brake_s']].map(([label,key])=><tr key={key}><td>{label}</td><td>{report.original.trace_summary[key] ?? 'Not recorded'}</td><td>{report.proposed.trace_summary[key] ?? 'Not recorded'}</td></tr>)}
      </tbody></table></div>}
      <details><summary>AI hypothesis and proposal notes — unverified interpretation</summary><p>These notes may contain mistakes. The measured signals above are authoritative; the notes do not determine the verdict.</p><p>{report.hypothesis}</p><p>{report.rationale}</p></details>
      <h3>Controller settings tested</h3>
      <div className="table-scroll"><table className="metric-table"><thead><tr><th>Controller setting</th><th>Original</th><th>Proposed</th></tr></thead><tbody>
        {Object.entries(report.proposed_settings).map(([key,value])=><tr key={key}><td>{settingLabels[key]?.[0] || key}</td><td>{Number(report.baseline_settings[key].toFixed(2))} {settingLabels[key]?.[1]}</td><td>{Number(value.toFixed(2))} {settingLabels[key]?.[1]}</td></tr>)}
      </tbody></table></div>
      <div className="adjustment-actions"><button className="quiet" disabled={disabled} onClick={()=>onReplay(report,'reactive')}>Replay original</button><button className="primary" disabled={disabled} onClick={()=>onReplay(report,'cautious')}>Replay proposed adjustment</button><button className="text-btn" onClick={download}>Export developer report ↓</button></div>
      <h3>Six additional simulation checks</h3>
      <p>{Object.entries(report.regression_counts).map(([key,value])=>`${value} ${key}`).join(' · ')}</p>
      <details><summary>Inspect regression evidence and evaluation rule</summary><p>{report.evaluation_rule}</p>
        {report.regressions.map((row,i)=><div key={i}><strong>Case {i+1}: {row.verdict}</strong><p>Collisions: {String(row.original.collision)} → {String(row.proposed.collision)}; elapsed: {row.original.duration_s}s → {row.proposed.duration_s}s{row.original.missed_exit !== undefined && <>; missed exit: {String(row.original.missed_exit)} → {String(row.proposed.missed_exit)}; lane reversals: {row.original.direction_reversals} → {row.proposed.direction_reversals}</>}</p><pre>{JSON.stringify(row.scenario,null,2)}</pre></div>)}
      </details><p className="field-help">{report.limitations}</p>
    </div>}
  </section>;
}
