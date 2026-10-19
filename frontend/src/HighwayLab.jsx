import {useState,useEffect,useRef,useCallback} from 'react';
import {createHighway,highwayFrame} from './highwayScene.js';
import {createImpactAudio} from './impact.js';
import './highway.css';
const DEFAULT={kind:'highway',speed_kmh:115,traffic_kmh:85,speed_variation:23,spacing_m:85,exit_distance_m:950,aggressiveness:.9,traffic_phase:3};
const FIELDS=[['speed_kmh','Target speed',80,130,1,'km/h'],['traffic_kmh','Traffic speed',60,110,1,'km/h'],['speed_variation','Traffic speed variation',0,30,1,'km/h'],['spacing_m','Traffic spacing',25,90,1,'m'],['exit_distance_m','Distance to exit',350,1600,10,'m'],['aggressiveness','Aggressiveness',.1,1,.05,''],['traffic_phase','Traffic pattern phase',0,30,.5,'rad']];
const NAMES={reactive:'Aggressive',cautious:'Exit-aware'};
async function api(path,body,signal){const r=await fetch(path,{signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
function HighwayReplay({pair,policy,setPolicy,playing,setPlaying,time,setTime}){
 const canvas=useRef(null),map=useRef(null),view=useRef(null),latest=useRef(null),audio=useRef(null);
 const [camera,setCamera]=useState('chase'),[fallback,setFallback]=useState(false),[sound,setSound]=useState(true),[rate,setRate]=useState(2);
 const run=pair?.[policy],frame=run?highwayFrame(run.frames,time):null;
 latest.current={frame,scenario:run?.scenario,camera,impact:!!run?.metrics.collision&&time>=run.metrics.duration_s};
 const paint=useCallback(()=>{const s=latest.current;if(!s.frame)return;
   view.current?.update(s.frame,s.scenario,s.camera,s.impact);
   const el=map.current,ctx=el?.getContext('2d');if(!ctx)return;
   const w=el.width=900,h=el.height=320;ctx.fillStyle='#a6b28a';ctx.fillRect(0,0,w,h);ctx.fillStyle='#414b56';ctx.fillRect(0,50,w,220);
   ctx.strokeStyle='#fff';ctx.setLineDash([15,14]);for(const y of [123,197]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}ctx.setLineDash([]);
   const px=x=>180+(x-s.frame.x)*4,py=y=>86+y*20;
   ctx.fillStyle='#e9bf7d';for(const c of s.frame.traffic)ctx.fillRect(px(c.x)-9,py(c.y)-13,18,26);
   ctx.fillStyle=s.impact?'#ef6449':'#e5f5ed';ctx.fillRect(171,py(s.frame.y)-13,18,26);
   ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.fillText(`Exit in ${Math.max(0,s.scenario.exit_distance_m-s.frame.x).toFixed(0)} m →`,20,30);
 },[]);
 useEffect(()=>{const c=canvas.current;const lost=e=>{e.preventDefault();setFallback(true);view.current=null;};c.addEventListener('webglcontextlost',lost);
   let owned;try{owned=createHighway(c);view.current=owned;setFallback(false);paint();}catch{setFallback(true);}
   const obs=new ResizeObserver(paint);obs.observe(c);
   return()=>{obs.disconnect();c.removeEventListener('webglcontextlost',lost);view.current=null;owned?.dispose();};
 },[paint]);
 useEffect(()=>{paint();},[frame,camera,paint,fallback]);
 useEffect(()=>{if(!sound)return;const unlock=()=>{try{audio.current??=createImpactAudio();audio.current?.resume().catch(()=>{});}catch{setSound(false);}};document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);return()=>{document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock);};},[sound]);
 useEffect(()=>()=>{audio.current?.close();audio.current=null;},[]);
 useEffect(()=>{if(!playing||!run)return;let id,last=null,t=time;
   const tick=now=>{if(last!==null)t=Math.min(run.metrics.duration_s,t+Math.min(.1,(now-last)/1000)*rate);last=now;setTime(t);
     if(t>=run.metrics.duration_s){setPlaying(false);if(sound&&run.metrics.collision)audio.current?.play();return;}id=requestAnimationFrame(tick);};id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);
 },[playing,run,rate,sound,setPlaying,setTime]);
 const switchPolicy=p=>{setPlaying(false);setPolicy(p);setTime(Math.min(time,pair[p].metrics.duration_s));};
 return <section className="panel highway-replay" id="highwayReplay">
   <div className="panel-title"><h2>Highway replay</h2><span className="tag">SIMULATED</span></div>
   <div className="highway-toolbar">{Object.entries(NAMES).map(([key,label])=><button key={key} className={policy===key?'primary':'quiet'} disabled={!pair} onClick={()=>switchPolicy(key)}>{label}</button>)}<select aria-label="Highway camera" value={camera} onChange={e=>setCamera(e.target.value)}><option value="chase">Chase camera</option><option value="top">Overhead</option><option value="driver">Driver view</option><option value="2d">2D map</option></select></div>
   <div className="highway-viewport"><canvas ref={canvas} hidden={fallback||camera==='2d'} aria-label="Three-dimensional highway replay"/><canvas ref={map} hidden={!fallback&&camera!=='2d'} aria-label="Highway map replay"/>
   <div className="highway-hud"><strong>{frame?(frame.v*3.6).toFixed(0):'—'} km/h</strong><span>Exit in {frame?Math.max(0,run.scenario.exit_distance_m-frame.x).toFixed(0):'—'} m</span><span>{frame?.reason||'Loading highway…'}</span></div></div>
   {fallback&&<p role="status">3D unavailable. Showing the 2D highway replay.</p>}
   <div className="highway-toolbar"><button className="primary" disabled={!run} onClick={()=>{if(time>=run.metrics.duration_s)setTime(0);setPlaying(!playing);}}>{playing?'Pause':'Play replay'}</button><span>{time.toFixed(1)} / {run?.metrics.duration_s??0}s</span><select aria-label="Playback speed" value={rate} onChange={e=>setRate(Number(e.target.value))}>{[1,2,4].map(n=><option key={n} value={n}>{n}×</option>)}</select><label><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/> Impact sound</label></div>
   <input className="highway-timeline" aria-label="Highway timeline" type="range" min="0" max={run?.metrics.duration_s||1} step=".1" value={time} onChange={e=>{setPlaying(false);setTime(Number(e.target.value));}}/>
   {run&&<p className="field-help">Case {run.id} · {NAMES[policy]} controller · Lane changes and traffic motion come from the simulator.</p>}
 </section>;
}
export default function HighwayLab(){
 const [draft,setDraft]=useState(DEFAULT),[pair,setPair]=useState(null),[policy,setPolicy]=useState('reactive'),[playing,setPlaying]=useState(false),[time,setTime]=useState(0);
 const [concern,setConcern]=useState('Investigate unnecessary left–right lane changes within one mile of a right-side highway exit when the controller aggressively prioritizes speed.');
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[source,setSource]=useState('Default highway example'),[result,setResult]=useState(null);
 const [runs,setRuns]=useState(()=>{try{return JSON.parse(localStorage.getItem('blindspot-highway-runs-v1')||'[]').filter(r=>r?.scene==='highway'&&Array.isArray(r.rows)).slice(0,8);}catch{return [];}});
 useEffect(()=>{try{localStorage.setItem('blindspot-highway-runs-v1',JSON.stringify(runs));}catch{setMessage('Browser storage is full. Export this investigation to keep it.');}},[runs]);
 const active=useRef(true),requestId=useRef(0),abort=useRef(null),lock=useRef(false);
 const load=useCallback(async(s,label,auto=false)=>{const id=++requestId.current;setLoading(true);try{const p=await api('/api/simulate',{scenario:s});if(!active.current||id!==requestId.current)return false;setPair(p);setDraft(p.reactive.scenario);setSource(label);setTime(0);setPolicy('reactive');setPlaying(auto);return true;}catch(e){if(active.current)setMessage(`Replay failed: ${e.message}`);return false;}finally{if(active.current&&id===requestId.current)setLoading(false);}},[]);
 useEffect(()=>{active.current=true;api('/api/status').then(s=>{if(active.current)setStatus(s);}).catch(e=>{if(active.current)setMessage(e.message);});load(DEFAULT,'Default highway example');return()=>{active.current=false;requestId.current++;abort.current?.abort();};},[load]);
 async function investigate(mode){if(lock.current)return;if(mode==='ai'&&!status?.connection.configured){setMessage(status?.connection.enabled===false?'Live AI is disabled on this deployment. Enable it in Render to generate highway tests.':'Live AI is not connected. Configure a Nebius Token Factory key on the server.');return;}
   lock.current=true;setBusy(true);setMessage('Starting highway investigation…');const controller=new AbortController();abort.current=controller;
   try{const job=await api('/api/investigate',{scene:'highway',mode,budget:12,seed:17,concern},controller.signal);
     while(active.current&&!controller.signal.aborted){await new Promise(r=>setTimeout(r,650));if(controller.signal.aborted)break;const state=await api('/api/jobs/'+job.job_id,undefined,controller.signal);
       if(state.status==='error')throw Error(state.error);
       if(state.status==='done'){
         setResult(state.result);setRuns(previous=>[state.result,...previous].slice(0,8));const rows=state.result.rows;
         const chosen=rows.reduce((best,row)=>row.reactive.direction_reversals>best.reactive.direction_reversals?row:best,rows[0]);
         const label=`${mode==='ai'?'Live AI':'Random search'} · case ${chosen.index} of ${rows.length} · most aggressive-controller reversals`;
         const loaded=await load(chosen.scenario,label,true);
         if(active.current){setMessage(loaded?'12 tests complete. Replaying the case with the most aggressive-controller direction reversals.':'Tests saved below. Replay failed to load; open a case to retry.');if(loaded)document.getElementById('highwayReplay')?.scrollIntoView({behavior:'smooth',block:'start'});}break;
       }setMessage(`${state.progress.completed||0}/12 tests · ${state.progress.message}`);
     }
   }catch(e){if(active.current&&e.name!=='AbortError')setMessage(`Investigation failed: ${e.message}. The previous replay remains displayed.`);}finally{lock.current=false;if(active.current)setBusy(false);}
 }
 function exportRun(){const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='blindspot-highway-investigation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <main className="highway-lab"><header className="highway-heading"><p className="eyebrow">BLINDSPOT / HIGHWAY LAB</p><h1>Faster lane.<br/><em>Better decision?</em></h1><p>Investigate repeated lane changes, tight merges, and missed exits in moving traffic.</p></header>
 <div className="highway-layout"><aside className="panel highway-settings"><h2>Build a highway test</h2><label className="field-label" htmlFor="highwayConcern">WHAT DO YOU WANT TO INVESTIGATE?</label><textarea id="highwayConcern" maxLength="1000" value={concern} onChange={e=>setConcern(e.target.value)}/><button id="highwayGenerate" className="primary full" disabled={busy||loading} onClick={()=>investigate('ai')}>{busy?'Investigating…':'Generate & replay with AI'} ↗</button><p className="field-help">Nemotron proposes 12 highway tests through Nebius. The simulator measures the outcomes; a generated case plays automatically. Uses API credits.</p><button className="quiet full" disabled={busy||loading} onClick={()=>investigate('random')}>Try 12 random tests · no AI</button><p className="job-progress" role="status">{message||'You can run the default highway example without AI.'}</p><div className="divider"/><h3>Manual highway parameters</h3>{FIELDS.map(([key,label,min,max,step,unit])=><label className="highway-control" key={key}>{label}<output>{draft[key]} {unit}</output><input type="range" min={min} max={max} step={step} value={draft[key]} onChange={e=>setDraft({...draft,[key]:Number(e.target.value)})}/></label>)}<button className="dark full" disabled={loading||busy} onClick={()=>load(draft,'Manual highway scenario',true)}>Apply parameters & replay</button></aside>
 <div><p className="field-help" id="highwaySource">{source}</p><HighwayReplay {...{pair,policy,setPolicy,playing,setPlaying,time,setTime}}/>
 {pair&&<section className="panel highway-results"><h2>Same traffic. Two controllers.</h2><p className="field-help">Experimental handwritten policies. Exit-aware does not guarantee a safer outcome.</p><div className="highway-table-wrap"><table><thead><tr><th>Measured outcome</th><th>Aggressive</th><th>Exit-aware</th></tr></thead><tbody>{[['Lane changes initiated','lane_changes'],['Direction reversals','direction_reversals'],['Collision','collision'],['Exit taken','exit_success'],['Missed exit','missed_exit'],['Elapsed time (s)','duration_s'],['Minimum clearance (m)','min_clearance_m']].map(([label,key])=><tr key={key}><th>{label}</th>{['reactive','cautious'].map(p=><td key={p}>{typeof pair[p].metrics[key]==='boolean'?(pair[p].metrics[key]?'Yes':'No'):pair[p].metrics[key]}</td>)}</tr>)}</tbody></table></div><p className="field-help">Elapsed time is travel time only for completed runs. A collision or timeout can prevent reaching the exit.</p><details><summary>Decision timeline · {NAMES[policy]}</summary>{pair[policy].events.map((e,i)=><p key={i}>{e.t.toFixed(1)}s · {e.text}</p>)}</details></section>}
 {runs.length>0&&<section className="panel highway-results"><h2>Saved highway investigations</h2><p className="field-help">Last eight runs, stored in this browser.</p><div className="highway-cases">{runs.map((r,i)=><button key={i} onClick={()=>setResult(r)}>{i===0?"Latest":"Previous"} · {r.mode} · {r.budget} tests · {r.concern.slice(0,60)}</button>)}</div></section>}
 {result&&<section className="panel highway-results"><h2>Highway investigation</h2><p>{result.concern}</p><p className="field-help">Choose another measured case to replay.</p><div className="highway-cases">{result.rows.map(row=><button key={row.index} disabled={loading||busy} onClick={()=>load(row.scenario,`${result.mode==='ai'?'Live AI':'Random'} · case ${row.index}`,true)}>#{row.index} · {row.reactive.lane_changes} changes · {row.reactive.direction_reversals} reversals{row.reactive.collision?' · collision':''}</button>)}</div><details><summary>Agent proposals and measured inputs</summary>{result.rounds.map((r,i)=><p key={i}>{r.hypothesis}</p>)}<pre>{JSON.stringify(pair?.reactive.scenario,null,2)}</pre></details><button className="text-btn" onClick={exportRun}>Export investigation JSON ↓</button></section>}
 </div></div><p className="highway-disclaimer">Synthetic three-lane kinematic simulation. Background vehicles follow prescribed speed waves and do not react to the ego vehicle. No sensor noise, learned driving policy, or Tesla FSD software. Lane changes take two seconds; results are prototype evidence, not real-world safety validation.</p></main>;
}
