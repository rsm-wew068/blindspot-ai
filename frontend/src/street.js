import * as THREE from "three";

// Simulation (x, y) maps to world (x, height, -y). All motion comes from replay frames.
export function createStreet(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#cbdce0");
  scene.fog = new THREE.Fog("#cbdce0", 65, 155);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 230);
  scene.add(new THREE.HemisphereLight("#e5f4ff", "#737664", 2.3));
  const sun = new THREE.DirectionalLight("#ffefd4", 3.2);
  sun.position.set(30, 55, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -60,
    right: 60,
    top: 50,
    bottom: -50,
    near: 1,
    far: 140,
  });
  sun.shadow.bias = -0.0004;
  sun.target.position.set(30, 0, 0);
  scene.add(sun, sun.target);
  const materials = new Map();
  function mat(color, extra = {}) {
    const k = color + JSON.stringify(extra);
    if (!materials.has(k))
      materials.set(
        k,
        new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }),
      );
    return materials.get(k);
  }
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function box(parent, x, y, z, w, h, d, color, shadow = false, extra = {}) {
    const m = new THREE.Mesh(cube, mat(color, extra));
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cylinder(parent, x, y, z, r, h, color) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 10),
      mat(color),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  box(scene, 40, -0.24, 0, 260, 0.4, 160, "#b5c0ad");
  box(scene, 40, -0.025, 0, 240, 0.08, 10.4, "#444e53");
  for (const z of [-7.1, 7.1]) {
    box(scene, 40, 0.08, z, 240, 0.22, 3.8, "#c5c7be");
    box(scene, 40, 0.13, Math.sign(z) * 5.3, 240, 0.3, 0.18, "#e2ded2");
  }
  // One-way travel lane, centered on the simulated ego path, with parking on both sides.
  // Solid white edges stop at the crosswalk. No misleading yellow lane divider.
  for (const z of [-1.8, 1.8]) {
    box(scene, -8.5, 0.025, z, 103, 0.012, 0.10, '#dce0d7');
    box(scene, 103.5, 0.025, z, 113, 0.012, 0.10, '#dce0d7');
  }
  function parkingBay(parent, x, z, length = 6.4) {
    for (const side of [-1, 1]) {
      box(parent, x + side * length / 2, 0.031, z, .10, .016, 2.9, '#c8d0cd');
    }
    box(parent, x, .031, z - Math.sign(z) * 1.45, length, .016, .10, '#c8d0cd');
  }
  // Repeated forward arrows make the single travel direction explicit.
  for (const x of [-10, 12, 31, 63, 88]) {
    box(scene, x, .033, 0, 2, .015, .18, '#e1e5dc');
    for (const sign of [-1, 1]) {
      const tip = box(scene, x + .6, .033, sign * .3, 1.1, .015, .14, '#e1e5dc');
      tip.rotation.y = sign * Math.PI / 5;
    }
  }
  for (let z = -4.4; z < 4.8; z += 0.9)
    box(scene, 45, 0.035, z, 4, 0.02, 0.46, "#eae9da");
  box(scene, 40.8, 0.03, -0.1, 0.22, 0.02, 3.4, "#efeee2");
  // Original procedural architecture: no downloaded models or third-party textures.
  const colors = ["#d7c3a0", "#b5c8b5", "#c0b1c7", "#a7bdc8", "#d4aba0"];
  for (let i = 0; i < 19; i++)
    for (const side of [-1, 1]) {
      const x = -35 + i * 9.6,
        z = side * 14.5,
        h = i % 6 === 0 ? 19 : 9 + ((i * 7 + (side + 1) * 3) % 5);
      box(scene, x, h / 2, z, 8.9, h, 10, colors[(i + (side + 1)) % 5], true);
      box(scene, x, h + 0.15, z, 9.2, 0.3, 10.3, "#dfddd2");
      box(scene, x, 2, side * 9.39, 8.8, 3.5, 0.12, "#546662");
      for (let row = 0; row < Math.floor((h - 4) / 3); row++)
        for (let col = 0; col < 3; col++) {
          box(
            scene,
            x + (col - 1) * 2.5,
            5 + row * 3,
            side * 9.43,
            1.35,
            1.7,
            0.15,
            "#526b77",
            false,
            { metalness: 0.25, roughness: 0.32 },
          );
          box(
            scene,
            x + (col - 1) * 2.5,
            4.1 + row * 3,
            side * 9.3,
            1.65,
            0.12,
            0.35,
            "#d9d8cb",
          );
        }
      // San Francisco-inspired bay windows and cornices; original flat-street scenery.
      for (let row = 0; row < Math.floor((h - 4) / 3); row++) {
        const bayY = 5 + row * 3;
        box(scene, x, bayY, side * 9.0, 2.8, 2.2, .85, colors[(i + (side + 1)) % 5]);
        box(scene, x, bayY, side * 8.55, 1.9, 1.55, .08, '#496777');
        box(scene, x, bayY - 1.15, side * 8.95, 3.15, .18, 1.15, '#efe7d6');
        box(scene, x, bayY + 1.15, side * 8.95, 3.15, .18, 1.15, '#efe7d6');
      }
      box(scene, x, h - .3, side * 9.2, 9.3, .35, .8, '#efe7d6');
      if (i % 2 === 0) {
        box(
          scene,
          x,
          3.6,
          side * 8.9,
          7,
          0.18,
          1.3,
          i % 4 === 0 ? "#6d8975" : "#b77c62",
        );
      }
    }
  for (let x = -22; x < 140; x += 18)
    for (const side of [-1, 1]) {
      const z = side * 7.8;
      cylinder(scene, x, 1.45, z, 0.16, 2.9, "#766757");
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.9, 1),
        mat("#63816b"),
      );
      crown.position.set(x, 3.8, z);
      crown.scale.y = 1.35;
      crown.castShadow = true;
      scene.add(crown);
      box(scene, x, 0.3, z, 2, 0.5, 2, "#909e8b");
      cylinder(scene, x + 6, 3.1, side * 6, 0.055, 6.2, "#4a595b");
      box(scene, x + 6, 6.2, side * 5.65, 0.3, 0.15, 1, "#e6e4c9");
    }
  // Curbside parking meters reinforce the parked-car context.
  for (let x = -15; x < 120; x += 13) {
    cylinder(scene, x, .65, -5.9, .045, 1.3, '#647573');
    box(scene, x, 1.45, -5.9, .3, .4, .22, '#7f9490');
    box(scene, x, 1.47, -5.76, .18, .16, .03, '#233e45');
  }
  function vehicle(van = false, color = "#eeeee3") {
    const g = new THREE.Group(),
      length = van ? 5 : 4.2,
      width = van ? 2.6 : 1.8;
    box(g, 0, 0.65, 0, length, 0.72, width, color, true, {
      metalness: 0.28,
      roughness: 0.35,
    });
    box(
      g,
      van ? -0.2 : -0.25,
      van ? 1.52 : 1.2,
      0,
      van ? 4.2 : 2.45,
      van ? 1.2 : 0.68,
      width - 0.14,
      color,
      true,
      { metalness: 0.18, roughness: 0.4 },
    );
    const front = van ? 1.96 : 1.02;
    box(
      g,
      front,
      van ? 1.7 : 1.3,
      0,
      0.055,
      van ? 0.56 : 0.48,
      width - 0.32,
      "#223c4a",
      false,
      { metalness: 0.5, roughness: 0.15 },
    );
    if (!van) {
      for (const z of [-0.84, 0.84])
        box(g, -0.23, 1.3, z, 2.1, 0.42, 0.03, "#294650", false, {
          metalness: 0.4,
          roughness: 0.18,
        });
      box(g, -1.49, 1.3, 0, 0.05, 0.42, 1.42, "#294650");
    } else
      for (const z of [-1.24, 1.24])
        box(g, 1.48, 1.68, z, 0.75, 0.56, 0.03, "#294650");
    const wheels = [];
    for (const x of [-length * 0.32, length * 0.32])
      for (const z of [-width / 2, width / 2]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.19, 18),
          mat("#263034"),
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.37, z);
        g.add(wheel);
        wheels.push(wheel);
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.19, 0.19, 0.2, 12),
          mat("#b0b9b5", { metalness: 0.7 }),
        );
        hub.rotation.x = Math.PI / 2;
        hub.position.copy(wheel.position);
        g.add(hub);
      }
    for (const z of [-width * 0.34, width * 0.34])
      box(g, length / 2 + 0.012, 0.78, z, 0.04, 0.14, 0.32, "#fff4c7", false, {
        emissive: "#fff2bc",
        emissiveIntensity: 0.4,
      });
    const brake = new THREE.MeshStandardMaterial({
      color: "#bf302c",
      emissive: "#ff3020",
      emissiveIntensity: 0.15,
    });
    for (const z of [-width * 0.34, width * 0.34]) {
      const lamp = box(
        g,
        -length / 2 - 0.012,
        0.79,
        z,
        0.04,
        0.17,
        0.36,
        "#bf302c",
      );
      lamp.material = brake;
    }
    box(g, -length / 2 - 0.025, 0.54, 0, 0.035, 0.15, 0.36, "#dee1d9");
    g.userData = { brake, wheels };
    scene.add(g);
    return g;
  }
  const ego = vehicle(),
    van = vehicle(true, "#d8d8cd");
  for (let i = 0; i < 6; i++) {
    if (Math.abs(-20 + i * 22 - 45) < 12) continue;
    const parked = vehicle(false, ["#607b80", "#8d7065", "#879077"][i % 3]);
    const x = -20 + i * 22;
    parked.position.set(x, 0, 3.55);
    parkingBay(scene, x, 3.55);
  }
  const vanBay = new THREE.Group();
  parkingBay(vanBay, 0, -3.5, 5.8);
  scene.add(vanBay);
  const impactRing = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.95, 48),
    new THREE.MeshBasicMaterial({color:'#f28b58', side:THREE.DoubleSide, transparent:true, opacity:0.9, depthWrite:false}),
  );
  impactRing.rotation.x = -Math.PI / 2;
  impactRing.visible = false;
  scene.add(impactRing);
  const person = new THREE.Group();
  scene.add(person);
  cylinder(person, 0, 1.05, 0, 0.21, 0.64, "#cf724c");
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 10),
    mat("#d6ac87"),
  );
  head.position.y = 1.55;
  person.add(head);
  const legs = [];
  for (const x of [-0.12, 0.12]) {
    const leg = box(person, x, 0.43, 0, 0.16, 0.65, 0.18, "#30495a", true);
    legs.push(leg);
  }
  for (const x of [-0.3, 0.3])
    box(person, x, 1.03, 0, 0.12, 0.6, 0.13, "#cf724c");
  // Ground-plane occlusion envelope uses the same sensor/van corners as the 2D view.
  const shadowGeometry = new THREE.BufferGeometry();
  shadowGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(18), 3),
  );
  const blind = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({
      color: "#dfb358",
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  scene.add(blind);
  let mode = "chase",
    showBlind = false;
  function update(frame, s, t, collision) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const size = new THREE.Vector2();
    renderer.getSize(size);
    if (size.x !== rect.width || size.y !== rect.height) {
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    }
    impactRing.visible = !!collision;
    impactRing.position.set(45, 0.07, -(frame.ped_y ?? 0));
    ego.position.x = frame.x;
    ego.visible = mode !== "driver";
    ego.userData.brake.emissiveIntensity = frame.a < -0.1 ? 3 : 0.15;
    van.position.set(45 - s.van_gap - 2.5, 0, -3.5);
    vanBay.position.x = van.position.x;
    person.visible = frame.ped_y !== null;
    if (person.visible) {
      person.position.set(45, 0, -frame.ped_y);
      const stride =
        t > s.emerge_s && frame.ped_y > -6
          ? Math.sin((t - s.emerge_s) * 9) * 0.32
          : 0;
      legs[0].rotation.x = stride;
      legs[1].rotation.x = -stride;
    }
    const sensor = frame.x + 2.1,
      start = 45 - s.van_gap - 5,
      end = 45 - s.van_gap;
    const rays = [
      [start, 2.2],
      [end, 2.2],
      [start, 4.8],
      [end, 4.8],
    ]
      .map(([x, y]) => ({ x, y, a: Math.atan2(y, x - sensor) }))
      .sort((a, b) => a.a - b.a);
    const a = rays[0],
      b = rays[3],
      points = [
        [a.x, 0.045, -a.y],
        [sensor + 90 * Math.cos(a.a), 0.045, -90 * Math.sin(a.a)],
        [sensor + 90 * Math.cos(b.a), 0.045, -90 * Math.sin(b.a)],
        [b.x, 0.045, -b.y],
      ];
    shadowGeometry.attributes.position.array.set([
      ...points[0],
      ...points[1],
      ...points[2],
      ...points[0],
      ...points[2],
      ...points[3],
    ]);
    shadowGeometry.attributes.position.needsUpdate = true;
    shadowGeometry.computeBoundingSphere();
    blind.visible = showBlind;
    if (mode === "driver") {
      camera.position.set(frame.x + 0.65, 1.4, 0);
      camera.lookAt(frame.x + 26, 1.25, 0);
    } else if (mode === "overview") {
      camera.position.set(33, 48, 7);
      camera.lookAt(33, 0, 0);
    } else {
      camera.position.set(frame.x - 8.5, 4, 1.5);
      camera.lookAt(frame.x + 12, 0.8, 0);
    }
    renderer.render(scene, camera);
  }
  return {
    update,
    setCamera(next) {
      mode = next;
    },
    setOcclusion(next) {
      showBlind = next;
    },
    dispose() {
      const geometries = new Set(),
        mats = new Set();
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            mats.add(m);
        }
      });
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
