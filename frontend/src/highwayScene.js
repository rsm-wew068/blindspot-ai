import * as THREE from 'three';
export function createHighway(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#cbdfe9'); scene.fog = new THREE.Fog('#cbdfe9',180,430);
  const camera = new THREE.PerspectiveCamera(55,1,.1,1800);
  scene.add(new THREE.HemisphereLight('#ffffff','#7b8866',2.5));
  const light = new THREE.DirectionalLight('#fff3d7',2);light.position.set(0,80,-40);scene.add(light);
  const geometry = new THREE.BoxGeometry(1,1,1), materials=new Map();
  function box(parent,x,y,z,w,h,d,color) {
    if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.7}));
    const m=new THREE.Mesh(geometry,materials.get(color));m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;
  }
  box(scene,800,-.4,0,2400,.6,600,'#a6b28a');
  box(scene,800,-.04,3.6,2400,.15,13.7,'#414b56');
  for(const z of [-2.1,9.3])box(scene,800,.06,z,2400,.03,.13,'#f7e8a0');
  for(const z of [1.8,5.4])for(let x=-200;x<1900;x+=13)box(scene,x,.07,z,5,.03,.13,'#f5f4e8');
  for(const z of [-4]){
    box(scene,800,.8,z,2400,.25,.16,'#a8b7c1');
    for(let x=-100;x<1900;x+=20)box(scene,x,.4,z,.1,.8,.1,'#657782');
  }
  for(let x=-100;x<1800;x+=90){
    box(scene,x,5,-8,.25,10,.25,'#687784');box(scene,x,10,-5,.3,.15,6,'#687784');
    box(scene,x+35,2.8,32,8,5.6,10,'#889b78');
  }
  function car(color){
    const group=new THREE.Group();
    box(group,0,.65,0,4.4,.85,1.9,color);box(group,-.2,1.3,0,2.3,.7,1.7,color);
    box(group,.99,1.35,0,.04,.5,1.45,'#203449');box(group,-1.37,1.35,0,.04,.5,1.45,'#203449');
    for(const x of [-1.35,1.35])for(const z of [-.96,.96])box(group,x,.35,z,.7,.6,.18,'#202a32');
    for(const z of [-.65,.65]){box(group,2.22,.7,z,.03,.18,.35,'#fff5b5');box(group,-2.22,.7,z,.03,.18,.35,'#d3514b');}
    scene.add(group);return group;
  }
  const ego=car('#e8f4ef'), cars=new Map();
  const rightRail = box(scene,0,.8,11.4,1,.25,.16,'#a8b7c1');
  const ramp = new THREE.Group();scene.add(ramp);
  const rampRoad=box(ramp,35,-.015,8,95,.12,4,'#414b56');rampRoad.rotation.y=-Math.atan(.25);
  const sign = new THREE.Group();scene.add(sign);
  box(sign,0,4,12,.22,8,.22,'#a8b7c1');box(sign,0,8,9.3,.3,2.7,7,'#2c6959');
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=192;
  const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#23654f';ctx.fillRect(0,0,512,192);ctx.fillStyle='white';ctx.font='bold 48px sans-serif';ctx.fillText('EXIT  →',80,85);ctx.font='28px sans-serif';ctx.fillText('RIGHT LANE',115,140);
  const texture=new THREE.CanvasTexture(labelCanvas);const signMat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
  const signGeo=new THREE.PlaneGeometry(7,2.6);const face=new THREE.Mesh(signGeo,signMat);face.rotation.y=-Math.PI/2;face.position.set(-.17,8,9.3);sign.add(face);
  const ringGeo=new THREE.RingGeometry(2.5,3.3,48),ringMat=new THREE.MeshBasicMaterial({color:'#e86643',side:THREE.DoubleSide});
  const ring=new THREE.Mesh(ringGeo,ringMat);ring.rotation.x=-Math.PI/2;scene.add(ring);
  return {
    update(frame, scenario, mode='chase', impact=false){
      const {width,height}=canvas.getBoundingClientRect();if(!width||!height)return;
      const size=new THREE.Vector2();renderer.getSize(size);if(size.x!==width||size.y!==height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
      ego.position.set(frame.x,0,frame.y);ego.rotation.y=-Math.atan(frame.lateral || 0);ego.visible=mode!=='driver';
      const visible=new Set();
      for(const c of frame.traffic){visible.add(c.id);if(!cars.has(c.id))cars.set(c.id,car(['#7b91a7','#ba9a7b','#506a78'][Math.abs(c.id.charCodeAt(0))%3]));cars.get(c.id).visible=true;cars.get(c.id).position.set(c.x,0,c.y);}
      for(const [id,c] of cars)if(!visible.has(id))c.visible=false;
      rightRail.scale.x=scenario.exit_distance_m+180;rightRail.position.x=(scenario.exit_distance_m-180)/2;
      ramp.position.set(scenario.exit_distance_m,0,7.2);sign.position.x=scenario.exit_distance_m-35;
      ring.visible=impact;ring.position.set(frame.x,.12,frame.y);
      if(mode==='top'){camera.position.set(frame.x-15,80,3.6);camera.lookAt(frame.x+25,0,3.6);}
      else if(mode==='driver'){camera.position.set(frame.x+.7,1.8,frame.y);camera.lookAt(frame.x+70,1.8,frame.y);}
      else {camera.position.set(frame.x-15,9,frame.y+2);camera.lookAt(frame.x+28,.5,frame.y);}
      renderer.render(scene,camera);
    },
    dispose(){geometry.dispose();for(const m of materials.values())m.dispose();signGeo.dispose();signMat.dispose();texture.dispose();ringGeo.dispose();ringMat.dispose();renderer.dispose();}
  };
}
export function highwayFrame(frames,time){
  let i=0;while(i+1<frames.length&&frames[i+1].t<=time)i++;
  const a=frames[i],b=frames[i+1];if(!b)return a;
  const f=Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t))),byId=new Map(b.traffic.map(c=>[c.id,c]));
  return {...a,x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,v:a.v+(b.v-a.v)*f,
    lateral:(b.y-a.y)/Math.max(.01,b.x-a.x),traffic:a.traffic.map(c=>({...c,x:c.x+((byId.get(c.id)?.x??c.x)-c.x)*f}))};
}
