import {useState,useEffect,useRef,useCallback} from 'react';
import {createHighway,highwayFrame} from './highwayScene.js';
import {createImpactAudio} from './impact.js';
import './highway.css';
const NAMES={reactive:'Aggressive',cautious:'Exit-aware'};
export default function HighwayReplay({pair,policy,setPolicy,playing,setPlaying,time,setTime}){
 const canvas=useRef(null),map=useRef(null),view=useRef(null),latest=useRef(null),audio=useRef(null);
 const [camera,setCamera]=useState('chase'),[fallback,setFallback]=useState(false),[sound,setSound]=useState(true),[rate,setRate]=useState(1);
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
 return <section className="panel simulation highway-replay" id="highwayReplay">
   <div className="panel-title"><h2>Live replay <span className="muted"> / {camera === "top" ? "Bird’s-eye" : camera === "driver" ? "Driver view" : camera === "2d" ? "2D map" : "Chase camera"}</span></h2><span className="run-id" id="scenarioId">{run ? "CASE / " + run.id.toUpperCase() : "PREPARING"}</span></div>
   <div className="policy-tabs" role="group" aria-label="Replay controller">{Object.entries(NAMES).map(([key,label])=><button key={key} className={policy===key?'selected':''} disabled={!pair} onClick={()=>switchPolicy(key)}>{label} controller</button>)}</div>
   <div className="view-toolbar"><div role="group" aria-label="Replay camera">{[['chase','Chase'],['driver','Driver'],['top','Bird’s-eye'],['2d','2D map']].map(([key,label])=><button key={key} aria-pressed={camera===key} className={camera===key?'active':''} onClick={()=>setCamera(key)}>{label}</button>)}</div><label><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/> Impact sound {sound?'on':'off'}</label><button className="text-btn" onClick={async()=>{setSound(true);audio.current??=createImpactAudio();await audio.current?.resume();audio.current?.play();}}>Test sound ♪</button></div>
   <p className="street-note">Three travel lanes · moving traffic · right-side exit</p>
   <div className="canvas-wrap street-active highway-viewport"><canvas ref={canvas} hidden={fallback||camera==='2d'} aria-label="Three-dimensional highway replay"/><canvas ref={map} hidden={!fallback&&camera!=='2d'} aria-label="Highway map replay"/>
   <div className="driving-hud"><div className="hud-context"><span>RIGHT-SIDE HIGHWAY EXIT</span><strong>{frame?Math.max(0,run.scenario.exit_distance_m-frame.x).toFixed(0):'—'} m to exit</strong><small>{frame?.reason||'Loading highway…'}</small></div><div className="hud-speed"><strong>{frame?(frame.v*3.6).toFixed(0):'—'}</strong><span>KM/H</span><small>{latest.current.impact?'COLLISION':frame?.a<-.1?'BRAKING':time>=run?.metrics.duration_s?'COMPLETED':'CRUISING'}</small></div></div><div className="scene-top"><span className="scene-tag">HIGHWAY 01</span><span className="scene-status">{latest.current.impact?'COLLISION DETECTED':time>=run?.metrics.duration_s?'RUN ENDED':'REPLAY READY'}</span></div><div className="scene-bottom"><span>Test vehicle</span><span>Moving traffic</span><span>Right-side exit</span></div></div>
   {fallback&&<p role="status">3D unavailable. Showing the 2D highway replay.</p>}
   <div className="playbar"><button className="play" aria-label={playing?'Pause replay':'Play replay'} disabled={!run} onClick={()=>{if(time>=run.metrics.duration_s)setTime(0);setPlaying(!playing);}}>{playing?'Ⅱ':'▶'}</button><input aria-label="Replay timeline" type="range" min="0" max={run?.metrics.duration_s||1} step=".1" value={time} onChange={e=>{setPlaying(false);setTime(Number(e.target.value));}}/><span className="timestamp">{time.toFixed(2)} / {run?.metrics.duration_s.toFixed(2)??0} s</span><select aria-label="Playback speed" value={rate} onChange={e=>setRate(Number(e.target.value))}>{[.5,1,2,4].map(n=><option key={n} value={n}>{n}×</option>)}</select></div>
   {run&&<p className="field-help">Case {run.id} · {NAMES[policy]} controller · Lane changes and traffic motion come from the simulator.</p>}
 </section>;
}
