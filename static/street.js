import * as THREE from './vendor/three.module.min.js';

// Simulation (x, y) maps to world (x, height, -y). All motion comes from replay frames.
export function createStreet(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#cbdce0');scene.fog=new THREE.Fog('#cbdce0',65,155);
  const camera=new THREE.PerspectiveCamera(55,1,.1,230);
  scene.add(new THREE.HemisphereLight('#e5f4ff','#737664',2.3));
  const sun=new THREE.DirectionalLight('#ffefd4',3.2);sun.position.set(30,55,25);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-60,right:60,top:50,bottom:-50,near:1,far:140});sun.shadow.bias=-.0004;sun.target.position.set(30,0,0);scene.add(sun,sun.target);
  const materials=new Map();
  function mat(color,extra={}) {const k=color+JSON.stringify(extra);if(!materials.has(k))materials.set(k,new THREE.MeshStandardMaterial({color,roughness:.75,...extra}));return materials.get(k);}
  const cube=new THREE.BoxGeometry(1,1,1);
  function box(parent,x,y,z,w,h,d,color,shadow=false,extra={}){const m=new THREE.Mesh(cube,mat(color,extra));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;}
  function cylinder(parent,x,y,z,r,h,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,10),mat(color));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
  box(scene,40,-.24,0,260,.4,160,'#b5c0ad');
  box(scene,40,-.025,0,240,.08,10.4,'#444e53');
  for(const z of [-7.1,7.1]){box(scene,40,.08,z,240,.22,3.8,'#c5c7be');box(scene,40,.13,Math.sign(z)*5.3,240,.3,.18,'#e2ded2');}
  for(let x=-60;x<155;x+=7){box(scene,x,.023,1.9,3,.012,.11,'#e8dfb0');}
  for(const z of [-4.8,4.8])box(scene,40,.022,z,240,.01,.10,'#d3d8d2');
  for(let z=-4.4;z<4.8;z+=.9)box(scene,45,.035,z,4,.02,.46,'#eae9da');
  box(scene,40.8,.03,-.1,.22,.02,3.4,'#efeee2');
  // Original procedural architecture: no downloaded models or third-party textures.
  const colors=['#b9b8aa','#d0c3ac','#94a7a7','#b0b6a7','#c5ad99'];
  for(let i=0;i<19;i++)for(const side of [-1,1]){
    const x=-35+i*9.6,z=side*14.5,h=8+(i*7+(side+1)*3)%14;
    box(scene,x,h/2,z,8.9,h,10,colors[(i+(side+1))%5],true);
    box(scene,x,h+.15,z,9.2,.3,10.3,'#dfddd2');
    box(scene,x,2,side*9.39,8.8,3.5,.12,'#546662');
    for(let row=0;row<Math.floor((h-4)/3);row++)for(let col=0;col<3;col++){
      box(scene,x+(col-1)*2.5,5+row*3,side*9.43,1.35,1.7,.15,'#526b77',false,{metalness:.25,roughness:.32});
      box(scene,x+(col-1)*2.5,4.1+row*3,side*9.3,1.65,.12,.35,'#d9d8cb');
    }
    if(i%2===0){box(scene,x,3.6,side*8.9,7,.18,1.3,i%4===0?'#6d8975':'#b77c62');}
  }
  for(let x=-22;x<140;x+=18)for(const side of [-1,1]){
    const z=side*7.8;
    cylinder(scene,x,1.45,z,.16,2.9,'#766757');
    const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.9,1),mat('#63816b'));crown.position.set(x,3.8,z);crown.scale.y=1.35;crown.castShadow=true;scene.add(crown);
    box(scene,x,.3,z,2,.5,2,'#909e8b');
    cylinder(scene,x+6,3.1,side*6,.055,6.2,'#4a595b');box(scene,x+6,6.2,side*5.65,.3,.15,1,'#e6e4c9');
  }
  function vehicle(van=false,color='#eeeee3'){
    const g=new THREE.Group(),length=van?5:4.2,width=van?2.6:1.8;
    box(g,0,.65,0,length,.72,width,color,true,{metalness:.28,roughness:.35});
    box(g,van?-.2:-.25,van?1.52:1.2,0,van?4.2:2.45,van?1.2:.68,width-.14,color,true,{metalness:.18,roughness:.4});
    const front=van?1.96:1.02;
    box(g,front,van?1.7:1.3,0,.055,van?.56:.48,width-.32,'#223c4a',false,{metalness:.5,roughness:.15});
    if(!van){for(const z of [-.84,.84])box(g,-.23,1.3,z,2.1,.42,.03,'#294650',false,{metalness:.4,roughness:.18});box(g,-1.49,1.3,0,.05,.42,1.42,'#294650');}
    else for(const z of [-1.24,1.24])box(g,1.48,1.68,z,.75,.56,.03,'#294650');
    const wheels=[];
    for(const x of [-length*.32,length*.32])for(const z of [-width/2,width/2]){
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.19,18),mat('#263034'));wheel.rotation.x=Math.PI/2;wheel.position.set(x,.37,z);g.add(wheel);wheels.push(wheel);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.2,12),mat('#b0b9b5',{metalness:.7}));hub.rotation.x=Math.PI/2;hub.position.copy(wheel.position);g.add(hub);
    }
    for(const z of [-width*.34,width*.34])box(g,length/2+.012,.78,z,.04,.14,.32,'#fff4c7',false,{emissive:'#fff2bc',emissiveIntensity:.4});
    const brake=new THREE.MeshStandardMaterial({color:'#bf302c',emissive:'#ff3020',emissiveIntensity:.15});
    for(const z of [-width*.34,width*.34]){const lamp=box(g,-length/2-.012,.79,z,.04,.17,.36,'#bf302c');lamp.material=brake;}
    box(g,-length/2-.025,.54,0,.035,.15,.36,'#dee1d9');
    g.userData={brake,wheels};scene.add(g);return g;
  }
  const ego=vehicle(),van=vehicle(true,'#d8d8cd');
  for(let i=0;i<6;i++){if(Math.abs(-20+i*22-45)<12)continue;const parked=vehicle(false,['#607b80','#8d7065','#879077'][i%3]);parked.position.set(-20+i*22,0,4);parked.rotation.y=Math.PI;}
  const person=new THREE.Group();scene.add(person);
  cylinder(person,0,1.05,0,.21,.64,'#cf724c');
  const head=new THREE.Mesh(new THREE.SphereGeometry(.16,12,10),mat('#d6ac87'));head.position.y=1.55;person.add(head);
  const legs=[];for(const x of [-.12,.12]){const leg=box(person,x,.43,0,.16,.65,.18,'#30495a',true);legs.push(leg);}
  for(const x of [-.3,.3])box(person,x,1.03,0,.12,.6,.13,'#cf724c');
  // Ground-plane occlusion envelope uses the same sensor/van corners as the 2D view.
  const shadowGeometry=new THREE.BufferGeometry();shadowGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(18),3));
  const blind=new THREE.Mesh(shadowGeometry,new THREE.MeshBasicMaterial({color:'#dfb358',transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false}));scene.add(blind);
  let mode='chase',showBlind=false,lastState=null;
  function update(frame,s,t,collision){
    lastState=[frame,s,t,collision];
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const size=new THREE.Vector2();renderer.getSize(size);if(size.x!==rect.width||size.y!==rect.height){renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
    ego.position.x=frame.x;ego.visible=mode!=='driver';ego.userData.brake.emissiveIntensity=frame.a<-.1?3:.15;
    van.position.set(45-s.van_gap-2.5,0,-3.5);
    person.visible=frame.ped_y!==null;if(person.visible){person.position.set(45,0,-frame.ped_y);const stride=t>s.emerge_s&&frame.ped_y>-6?Math.sin((t-s.emerge_s)*9)*.32:0;legs[0].rotation.x=stride;legs[1].rotation.x=-stride;}
    const sensor=frame.x+2.1,start=45-s.van_gap-5,end=45-s.van_gap;
    const rays=[[start,2.2],[end,2.2],[start,4.8],[end,4.8]].map(([x,y])=>({x,y,a:Math.atan2(y,x-sensor)})).sort((a,b)=>a.a-b.a);
    const a=rays[0],b=rays[3],points=[[a.x,.045,-a.y],[sensor+90*Math.cos(a.a),.045,-90*Math.sin(a.a)],[sensor+90*Math.cos(b.a),.045,-90*Math.sin(b.a)],[b.x,.045,-b.y]];
    shadowGeometry.attributes.position.array.set([...points[0],...points[1],...points[2],...points[0],...points[2],...points[3]]);shadowGeometry.attributes.position.needsUpdate=true;shadowGeometry.computeBoundingSphere();blind.visible=showBlind;
    if(mode==='driver'){camera.position.set(frame.x+.65,1.4,0);camera.lookAt(frame.x+26,1.25,0);}
    else if(mode==='overview'){camera.position.set(33,48,7);camera.lookAt(33,0,0);}
    else {camera.position.set(frame.x-8.5,4,1.5);camera.lookAt(frame.x+12,.8,0);}
    renderer.render(scene,camera);
    document.getElementById('hudSpeed').textContent=(frame.v*3.6).toFixed(0);
    document.getElementById('hudBrake').textContent=collision?'COLLISION':frame.a<-.1?'BRAKING':'CRUISING';
    document.getElementById('hudBrake').classList.toggle('hazard',collision||frame.a<-.1);
    document.getElementById('hudVisibility').textContent=frame.ped_y===null?'NO PEDESTRIAN':frame.visible?'PEDESTRIAN VISIBLE':'PEDESTRIAN HIDDEN';
    document.getElementById('hudDistance').textContent=Math.max(0,45-(frame.x+2.1)).toFixed(1)+' m to crossing';
  }
  return {update,setCamera(next){mode=next;if(lastState)update(...lastState);},setOcclusion(next){showBlind=next;if(lastState)update(...lastState);},dispose(){renderer.dispose();}};
}
