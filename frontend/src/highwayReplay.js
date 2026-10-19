export function highwayFrame(frames,time){
  let i=0;while(i+1<frames.length&&frames[i+1].t<=time)i++;
  const a=frames[i],b=frames[i+1];if(!b)return a;
  const f=Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t))),byId=new Map(b.traffic.map(c=>[c.id,c]));
  return {...a,x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,v:a.v+(b.v-a.v)*f,
    lateral:(b.y-a.y)/Math.max(.01,b.x-a.x),traffic:a.traffic.map(c=>({...c,x:c.x+((byId.get(c.id)?.x??c.x)-c.x)*f}))};
}

export function drawHighwayMap(el, frame, scenario, collision) {
  const ctx=el.getContext('2d');const w=el.width=900,h=el.height=400;
  ctx.fillStyle='#a6b28a';ctx.fillRect(0,0,w,h);ctx.fillStyle='#414b56';ctx.fillRect(0,85,w,220);
  ctx.strokeStyle='#fff';ctx.setLineDash([15,14]);for(const y of [158,232]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}ctx.setLineDash([]);
  const px=x=>180+(x-frame.x)*4,py=y=>121+y*20;
  ctx.fillStyle='#e9bf7d';for(const c of frame.traffic)ctx.fillRect(px(c.x)-9,py(c.y)-13,18,26);
  ctx.fillStyle=collision?'#ef6449':'#e5f5ed';ctx.fillRect(171,py(frame.y)-13,18,26);
}
