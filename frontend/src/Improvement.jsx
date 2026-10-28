import { useEffect, useRef, useState } from 'react';
const settingLabels = {
  exit_prepare_m: ['Start preparing for exit', 'm'], lane_cooldown_s: ['Lane-change cooldown', 's'], speed_gain_mps: ['Required speed benefit', 'm/s'],
  caution_distance_m: ['Start slowing near crossing', 'm'], caution_speed_factor: ['Caution speed factor', ''], visible_margin_m: ['Visible-conflict braking margin', 'm'],
};
export default function Improvement({scenario, concern, disabled, connected, request, setBusy, onReplay, connect}) {
  const [report, setReport] = useState(null), [progress, setProgress] = useState(''), [running, setRunning] = useState(false);
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
          setReport(state.result); setProgress('Analysis and simulation checks complete.');
          onReplay(state.result, 'cautious'); break;
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
    const compact = {...report};
    for (const key of ['original','proposed']) { const {frames, ...rest} = report[key]; compact[key] = rest; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(compact,null,2)], {type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download='blindspot-controller-adjustment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="panel improvement" aria-label="Analyze and test a controller adjustment">
    <div className="panel-title"><h2>Understand the problem. Test a change.</h2><span className="tag">AI + SIMULATION</span></div>
    <p>Analyze the {scenario.kind === 'highway' ? 'aggressive' : 'reactive'} baseline in the current replay. AI proposes controller settings; the simulator tests the same conditions and six additional cases.</p>
    <button id="improveBtn" className="primary" disabled={disabled || running} onClick={improve}>{running ? 'Analyzing & testing…' : 'Analyze & test adjustment with AI'}</button>
    <p className="field-help">One AI request using Nebius credits and one shared daily allowance slot. This does not modify vehicle software.</p>
    {progress && <p role="status">{progress}</p>}
    {report && <div id="improvementReport">
      <h3>Measured result: {report.case_verdict}</h3>
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
      <h3>AI hypothesis — requires investigation</h3><p>{report.hypothesis}</p>
      <h3>Proposed adjustment</h3><p>{report.rationale}</p>
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
