// 太陽系モデル。
// 軌道は円軌道近似。公転周期はケプラーの第3法則 P² ∝ a³ / (M太陽 + m惑星) で計算
// しているため、惑星を重くすると公転が速くなる効果が見える。
// 表示距離は √(軌道長半径) で圧縮して全惑星が一画面に収まるようにしている。

import * as THREE from 'three';

const SUN_MASS_EARTH = 333000; // 太陽質量(地球質量単位)
const DIST_SCALE = 16;         // 表示距離 = DIST_SCALE * sqrt(AU)

// a: 軌道長半径(AU)、radius: 半径(地球=1)、mass: 質量(地球=1)
const PLANET_DATA = [
  { key: 'mercury', name: '水星',   a: 0.39,  radius: 0.38, mass: 0.055,  color: 0x9f8e84, phase: 4.40 },
  { key: 'venus',   name: '金星',   a: 0.72,  radius: 0.95, mass: 0.815,  color: 0xe8c47a, phase: 1.85 },
  { key: 'earth',   name: '地球',   a: 1.00,  radius: 1.00, mass: 1.0,    color: 0x4f94d4, phase: 0.00 },
  { key: 'mars',    name: '火星',   a: 1.52,  radius: 0.53, mass: 0.107,  color: 0xc1583c, phase: 5.60 },
  { key: 'jupiter', name: '木星',   a: 5.20,  radius: 11.2, mass: 317.8,  color: 0xd8b48a, phase: 2.95 },
  { key: 'saturn',  name: '土星',   a: 9.58,  radius: 9.45, mass: 95.2,   color: 0xe3d3a3, phase: 5.95, ring: true },
  { key: 'uranus',  name: '天王星', a: 19.2,  radius: 4.0,  mass: 14.5,   color: 0x9bd4d4, phase: 1.00 },
  { key: 'neptune', name: '海王星', a: 30.05, radius: 3.88, mass: 17.1,   color: 0x5a7fd4, phase: 6.20 },
];

function displayRadius(earthRadii) {
  return 0.5 + 0.55 * Math.cbrt(earthRadii);
}

export class SolarSystem {
  constructor() {
    this.scene = new THREE.Scene();
    this.planets = [];
    this.time = 0;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sunLight = new THREE.PointLight(0xfff4e0, 3, 0, 0);
    this.scene.add(sunLight);

    // 太陽
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd75e })
    );
    sun.name = '太陽';
    this.scene.add(sun);
    this.sun = sun;

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xffcc66,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(14);
    this.scene.add(glow);

    for (const data of PLANET_DATA) {
      this.planets.push(this._createPlanet(data));
    }
    this.setTime(0);
  }

  _createPlanet(data) {
    const baseR = displayRadius(data.radius);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(baseR, 28, 20),
      new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.85 })
    );
    mesh.name = data.name;

    if (data.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(baseR * 1.45, baseR * 2.3, 48),
        new THREE.MeshBasicMaterial({
          color: 0xcdbf9a, side: THREE.DoubleSide, transparent: true, opacity: 0.55,
        })
      );
      ring.rotation.x = Math.PI / 2 - 0.35;
      mesh.add(ring);
    }

    const label = makeLabel(data.name);
    label.position.y = baseR + 2.2;
    mesh.add(label);

    const orbit = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x3a5070, transparent: true, opacity: 0.7 })
    );

    this.scene.add(mesh);
    this.scene.add(orbit);

    const planet = {
      ...data,
      baseA: data.a,
      baseRadius: data.radius,
      baseMass: data.mass,
      sizeScale: 1,
      massScale: 1,
      mesh,
      label,
      orbit,
    };
    this._updateOrbit(planet);
    return planet;
  }

  _updateOrbit(planet) {
    const dist = DIST_SCALE * Math.sqrt(planet.a);
    planet.dist = dist;
    const pts = [];
    for (let i = 0; i < 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * dist, 0, Math.sin(t) * dist));
    }
    planet.orbit.geometry.dispose();
    planet.orbit.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }

  // 公転周期(年)。惑星が重いほど周期が短くなる
  periodOf(planet) {
    const mass = planet.baseMass * planet.massScale;
    return Math.sqrt(Math.pow(planet.a, 3) * SUN_MASS_EARTH / (SUN_MASS_EARTH + mass));
  }

  setTime(years) {
    this.time = years;
    for (const p of this.planets) {
      const ang = p.phase + (Math.PI * 2 * years) / this.periodOf(p);
      p.mesh.position.set(Math.cos(ang) * p.dist, 0, Math.sin(ang) * p.dist);
      p.mesh.rotation.y = years * 40; // 自転(雰囲気)
    }
  }

  getPlanet(key) {
    return this.planets.find((p) => p.key === key);
  }

  setSizeScale(key, scale) {
    const p = this.getPlanet(key);
    p.sizeScale = scale;
    p.mesh.scale.setScalar(scale);
    // ラベルは惑星と一緒に拡大されないよう打ち消す
    p.label.scale.set(10 / scale, 2.5 / scale, 1);
    p.label.position.y = displayRadius(p.baseRadius) + 2.2 / scale;
  }

  setMassScale(key, scale) {
    this.getPlanet(key).massScale = scale;
    this.setTime(this.time);
  }

  swapEarthJupiter() {
    const earth = this.getPlanet('earth');
    const jupiter = this.getPlanet('jupiter');
    [earth.a, jupiter.a] = [jupiter.a, earth.a];
    this._updateOrbit(earth);
    this._updateOrbit(jupiter);
    this.setTime(this.time);
    return earth.a !== earth.baseA; // 入れ替わった状態なら true
  }

  resetPlanets() {
    for (const p of this.planets) {
      p.a = p.baseA;
      p.massScale = 1;
      this._updateOrbit(p);
      this.setSizeScale(p.key, 1);
    }
    this.setTime(this.time);
  }

  get meshes() {
    return [this.sun, ...this.planets.map((p) => p.mesh)];
  }
}

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 38px "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#dce8ff';
  ctx.fillText(text, 128, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
  }));
  sprite.scale.set(10, 2.5, 1);
  return sprite;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,235,180,1)');
  g.addColorStop(0.35, 'rgba(255,200,110,0.45)');
  g.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
