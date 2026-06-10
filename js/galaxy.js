// 天の川銀河(渦巻銀河)のパーティクルモデル。
// 距離の単位は kpc(キロパーセク)、時間の単位は百万年(Myr)。
// 回転曲線は実際の銀河と同じ「フラット回転」(v ≈ 220 km/s ≈ 0.225 kpc/Myr)を採用。
// 角速度 ω = v / r が半径によって違うため、時間を進めると渦状腕が巻き込まれ、
// 過去に戻すとほどけていく様子が見られる。

import * as THREE from 'three';

const DISK_STARS = 55000;
const BULGE_STARS = 12000;
const HALO_STARS = 3000;
const ARMS = 4;            // 渦状腕の本数
const PITCH = 12 * Math.PI / 180; // 渦巻のピッチ角
const GALAXY_RADIUS = 16;  // kpc

const VERTEX_SHADER = /* glsl */`
  uniform float uTime;      // 百万年
  attribute float aRadius;  // 中心からの距離 (kpc)
  attribute float aAngle;   // 基準時刻(現在)での角度
  attribute float aY;
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;

  void main() {
    vColor = aColor;
    // フラット回転曲線: ω = 0.225 / r [rad/Myr]
    float omega = 0.225 / max(aRadius, 0.6);
    float ang = aAngle + omega * uTime;
    vec3 p = vec3(cos(ang) * aRadius, aY, sin(ang) * aRadius);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * (170.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vColor, a * 0.9);
  }
`;

function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function createGalaxy() {
  const group = new THREE.Group();
  const total = DISK_STARS + BULGE_STARS + HALO_STARS;

  const radius = new Float32Array(total);
  const angle = new Float32Array(total);
  const ys = new Float32Array(total);
  const sizes = new Float32Array(total);
  const colors = new Float32Array(total * 3);

  let i = 0;

  // --- 円盤と渦状腕の星 ---
  for (let n = 0; n < DISK_STARS; n++, i++) {
    // 指数分布で中心ほど星が多い
    let r = -3.2 * Math.log(1 - Math.random());
    r = Math.min(Math.max(r, 0.4), GALAXY_RADIUS);

    const arm = n % ARMS;
    const interArm = Math.random() < 0.28; // 腕の間に散らばる星
    // 対数螺旋: θ = θ0 + ln(r) / tan(pitch)
    let theta = (arm / ARMS) * Math.PI * 2 + Math.log(Math.max(r, 0.4)) / Math.tan(PITCH);
    theta += interArm ? (Math.random() - 0.5) * Math.PI : gaussian() * 0.22;

    radius[i] = r;
    angle[i] = theta;
    ys[i] = gaussian() * (0.25 + 0.35 * Math.exp(-r / 5));
    sizes[i] = 0.6 + Math.random() * 1.6;

    // 色: 内側は暖色、外側の腕は青白、星形成領域はピンク
    const t = Math.min(r / GALAXY_RADIUS, 1);
    let cr, cg, cb;
    if (!interArm && Math.random() < 0.04 && r > 3) {
      cr = 1.0; cg = 0.45 + Math.random() * 0.2; cb = 0.7; // HII領域
      sizes[i] *= 1.6;
    } else {
      cr = 1.0 - t * 0.38;
      cg = 0.88 - t * 0.18;
      cb = 0.72 + t * 0.28;
    }
    colors[i * 3] = cr; colors[i * 3 + 1] = cg; colors[i * 3 + 2] = cb;
  }

  // --- 中心バルジ ---
  for (let n = 0; n < BULGE_STARS; n++, i++) {
    const r3 = Math.abs(gaussian()) * 1.3 + 0.05;
    const phi = Math.random() * Math.PI * 2;
    const cosT = Math.random() * 2 - 1;
    const rxz = r3 * Math.sqrt(1 - cosT * cosT);

    radius[i] = Math.max(rxz, 0.05);
    angle[i] = phi;
    ys[i] = r3 * cosT * 0.62;
    sizes[i] = 0.7 + Math.random() * 1.7;

    const warm = 0.85 + Math.random() * 0.15;
    colors[i * 3] = 1.0;
    colors[i * 3 + 1] = warm * 0.88;
    colors[i * 3 + 2] = warm * 0.62;
  }

  // --- ハロー(銀河を包む薄い球状の星) ---
  for (let n = 0; n < HALO_STARS; n++, i++) {
    const r3 = 2 + Math.pow(Math.random(), 0.6) * 13;
    const phi = Math.random() * Math.PI * 2;
    const cosT = Math.random() * 2 - 1;

    radius[i] = Math.max(r3 * Math.sqrt(1 - cosT * cosT), 0.3);
    angle[i] = phi;
    ys[i] = r3 * cosT;
    sizes[i] = 0.4 + Math.random() * 0.7;

    colors[i * 3] = 0.75; colors[i * 3 + 1] = 0.72; colors[i * 3 + 2] = 0.85;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
  geo.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
  geo.setAttribute('aY', new THREE.BufferAttribute(ys, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GALAXY_RADIUS + 2);

  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  group.add(new THREE.Points(geo, mat));

  // 銀河中心の輝き
  const glowTex = makeGlowTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xffe9c4,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(7);
  group.add(glow);

  return {
    group,
    setTime(myr) { uniforms.uTime.value = myr; },
  };
}

// 遠方の背景星(時間で動かない)
export function createBackgroundStars(count = 2200, distance = 600) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const phi = Math.random() * Math.PI * 2;
    const cosT = Math.random() * 2 - 1;
    const sinT = Math.sqrt(1 - cosT * cosT);
    const d = distance * (0.7 + Math.random() * 0.3);
    pos[i * 3] = d * sinT * Math.cos(phi);
    pos[i * 3 + 1] = d * cosT;
    pos[i * 3 + 2] = d * sinT * Math.sin(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x8898bb,
    size: 1.4,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.8,
  }));
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,210,1)');
  g.addColorStop(0.3, 'rgba(255,220,160,0.5)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
