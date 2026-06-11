// 宇宙の歴史モード。
// ビッグバン(138億年前)から100億年後までの宇宙の膨張と銀河の進化を描く。
// 膨張は実際の宇宙論(ΛCDMモデル: 物質+ダークエネルギー)のスケール因子
//   a(t) = (Ωm/ΩΛ)^(1/3) · sinh^(2/3)( (3/2)·√ΩΛ·H0·t )
// を使用。現在(t=138億年)で a=1 になるよう正規化している。

import * as THREE from 'three';

export const NOW_GYR = 13.8;   // 現在の宇宙年齢(十億年)
export const END_GYR = 23.8;   // シミュレーション終端(=100億年後)

const OMEGA_M = 0.31;          // 物質の割合
const OMEGA_L = 0.69;          // ダークエネルギーの割合
const HUBBLE_TIME = 14.45;     // 1/H0 (十億年)
const T_RECOMB = 3.8e-4;       // 晴れ上がり(38万年)

const CLUSTERS = 70;           // 銀河団の数
const PER_CLUSTER = 60;
const FIELD_GALAXIES = 1500;   // 銀河団に属さない銀河
const RADIUS = 26;             // 共動座標での宇宙の表示半径

// ΛCDMのスケール因子(現在=1に正規化)
const A_NOW = rawScale(NOW_GYR);
function rawScale(tGyr) {
  const x = 1.5 * Math.sqrt(OMEGA_L) * (Math.max(tGyr, 1e-18) / HUBBLE_TIME);
  return Math.cbrt(OMEGA_M / OMEGA_L) * Math.pow(Math.sinh(x), 2 / 3);
}
export function scaleFactor(tGyr) {
  return rawScale(tGyr) / A_NOW;
}

const VERTEX_SHADER = /* glsl */`
  uniform float uTime;   // 宇宙年齢(十億年)
  uniform float uA;      // スケール因子
  attribute float aBirth;
  attribute float aSize;
  attribute float aTint;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // 共動座標 × スケール因子 = 実際の位置(宇宙膨張)
    vec3 p = position * uA;

    // 誕生時刻を過ぎたらゆっくり点灯
    vAlpha = smoothstep(aBirth, aBirth + 0.4, uTime);

    // 色の進化: 若い銀河は青白 → 成熟して黄白 → 遠い未来は赤く老いて暗くなる
    float age = max(uTime - aBirth, 0.0);
    vec3 young = vec3(0.55, 0.72, 1.0);
    vec3 adult = vec3(1.0, 0.93, 0.80);
    vec3 old   = vec3(1.0, 0.50, 0.32);
    vec3 c = mix(young, adult, smoothstep(0.0, 3.0, age));
    c = mix(c, old, smoothstep(14.5, 23.8, uTime));
    float dim = 1.0 - 0.45 * smoothstep(15.0, 23.8, uTime);
    vColor = c * (0.75 + 0.25 * aTint) * dim;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * (160.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.08, d);
    gl_FragColor = vec4(vColor, a * vAlpha * 0.95);
  }
`;

function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function createUniverse() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const total = CLUSTERS * PER_CLUSTER + FIELD_GALAXIES;
  const pos = new Float32Array(total * 3);
  const birth = new Float32Array(total);
  const size = new Float32Array(total);
  const tint = new Float32Array(total);

  let i = 0;
  const put = (x, y, z) => {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    // 誕生時刻: ほとんどが2〜15億年(最初の銀河の時代)
    birth[i] = Math.min(0.2 + Math.abs(gaussian()) * 0.55, 3.0);
    size[i] = 1.1 + Math.random() * 1.8 + Math.pow(Math.random(), 6) * 4.0;
    tint[i] = Math.random();
    i++;
  };

  // 銀河団(宇宙の大規模構造っぽい塊)
  for (let c = 0; c < CLUSTERS; c++) {
    const dir = new THREE.Vector3().randomDirection();
    const center = dir.multiplyScalar(RADIUS * Math.cbrt(Math.random()));
    for (let n = 0; n < PER_CLUSTER; n++) {
      put(
        center.x + gaussian() * 2.2,
        center.y + gaussian() * 2.2,
        center.z + gaussian() * 2.2
      );
    }
  }
  // 散在する銀河
  for (let n = 0; n < FIELD_GALAXIES; n++) {
    const dir = new THREE.Vector3().randomDirection();
    const r = RADIUS * 1.15 * Math.cbrt(Math.random());
    put(dir.x * r, dir.y * r, dir.z * r);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RADIUS * 2.5);

  const uniforms = { uTime: { value: 0 }, uA: { value: 1 } };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(points);

  // ビッグバン〜プラズマ時代の灼熱の光(晴れ上がりで消える)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(glow);

  // 私たちの天の川銀河の目印
  const mwPos = new THREE.Vector3(7, 1.5, 4);
  const mwLabel = makeLabel('私たちの天の川銀河');
  scene.add(mwLabel);

  function setTime(tGyr) {
    const a = scaleFactor(tGyr);
    uniforms.uTime.value = tGyr;
    uniforms.uA.value = a;

    // --- 火の玉宇宙の見た目 ---
    // 晴れ上がり(38万年)まで: 白熱 → オレンジ。その後すみやかに暗転
    const logT = Math.log10(Math.max(tGyr, 1e-15));
    const heat = 1 - THREE.MathUtils.smoothstep(logT, -15, Math.log10(T_RECOMB)); // 1=超高温
    const clear = THREE.MathUtils.smoothstep(logT, Math.log10(T_RECOMB), Math.log10(T_RECOMB * 30)); // 晴れ上がり進行

    const hot = new THREE.Color(1.0, 0.97, 0.9);   // 白熱
    const warm = new THREE.Color(1.0, 0.45, 0.12); // 晴れ上がり直前のオレンジ
    const fireball = hot.clone().lerp(warm, 1 - heat);

    // 背景色: プラズマ時代は宇宙全体が光っている
    const bg = fireball.clone().multiplyScalar(0.55 * (1 - clear));
    scene.background.copy(bg);

    // 中心の光球: 膨張しながら冷えて、晴れ上がりで消える
    glow.material.color.copy(fireball);
    glow.material.opacity = 1 - clear;
    glow.scale.setScalar(Math.max(a * RADIUS * 2.6, 6));
    glow.visible = clear < 0.999;

    // 天の川銀河ラベル(銀河が生まれてから表示)
    mwLabel.visible = tGyr > 0.5;
    mwLabel.position.copy(mwPos).multiplyScalar(a);
  }

  setTime(0);
  return { scene, setTime };
}

// ---------- 時代の解説 ----------

export function epochInfo(tGyr) {
  if (tGyr < 5.7e-15) return {
    title: '💥 ビッグバン',
    desc: '宇宙のはじまり。超高温・超高密度の素粒子のスープが、膨張しながら急速に冷えていく',
  };
  if (tGyr < T_RECOMB) return {
    title: '🔥 火の玉宇宙',
    desc: '最初の3分で水素とヘリウムの原子核が完成。光はプラズマの霧に阻まれてまっすぐ進めない',
  };
  if (tGyr < 0.002) return {
    title: '✨ 宇宙の晴れ上がり',
    desc: '38万年後、原子が生まれて宇宙は突然透明に。このとき放たれた光は今も宇宙マイクロ波背景放射として観測できる',
  };
  if (tGyr < 0.15) return {
    title: '🌑 暗黒時代',
    desc: 'まだ星がひとつもない暗闇の時代。重力が少しずつガスを集めて、星の材料を準備していく',
  };
  if (tGyr < 1.0) return {
    title: '🌟 最初の星々の誕生',
    desc: '宇宙誕生から数億年、ファーストスター(初代星)と小さな銀河が青白く輝き始める',
  };
  if (tGyr < 9.0) return {
    title: '🌌 銀河の時代',
    desc: '銀河どうしが衝突・合体しながら大きく成長していく。宇宙でもっとも星の誕生が盛んな時代',
  };
  if (tGyr < 9.5) return {
    title: '☀️ 太陽系の誕生',
    desc: '宇宙誕生から92億年(今から46億年前)、天の川銀河の片隅で太陽と地球が生まれた',
  };
  if (tGyr < 13.7) return {
    title: '🌍 成熟した宇宙',
    desc: 'ダークエネルギーによって膨張が加速に転じる。銀河では世代交代しながら星づくりが続く',
  };
  if (tGyr < 14.0) return {
    title: '📍 現在の宇宙',
    desc: '宇宙誕生から138億年。あなたはここにいる',
  };
  if (tGyr < 18.0) return {
    title: '🚀 加速膨張の未来',
    desc: 'ダークエネルギーで膨張はどんどん加速。銀河どうしはお互いにどんどん遠ざかっていく',
  };
  if (tGyr < 19.5) return {
    title: '💫 銀河の大衝突',
    desc: '今から約45億年後、天の川銀河とアンドロメダ銀河が衝突合体。同じころ太陽は赤色巨星になり、その後白色矮星へ',
  };
  return {
    title: '🌃 遠い未来',
    desc: '星の材料は少しずつ減り、宇宙はゆっくりと暗く静かになっていく(それでも星は何兆年も輝き続ける)',
  };
}

export function formatUniverseTime(tGyr) {
  const yr = tGyr * 1e9;
  let age;
  if (yr < 1 / 5256) { // 100分未満
    const sec = yr * 3.156e7;
    age = sec < 120 ? `${Math.max(sec, 1).toFixed(0)}秒` : `${(sec / 60).toFixed(0)}分`;
  } else if (yr < 1) {
    age = `${Math.max(yr * 365.25, 1).toFixed(0)}日`;
  } else if (yr < 1e4) {
    age = `${yr.toFixed(0)}年`;
  } else if (yr < 1e8) {
    age = `${(yr / 1e4).toFixed(0)}万年`;
  } else {
    const oku = yr / 1e8;
    age = oku < 10 ? `${oku.toFixed(1)}億年` : `${oku.toFixed(0)}億年`;
  }
  // 現在との差
  const diffOku = (NOW_GYR - tGyr) * 10;
  let rel;
  if (Math.abs(diffOku) < 0.05) rel = 'いま!';
  else if (diffOku > 0) rel = diffOku < 10 ? `${diffOku.toFixed(1)}億年前` : `${diffOku.toFixed(0)}億年前`;
  else rel = -diffOku < 10 ? `${(-diffOku).toFixed(1)}億年後` : `${(-diffOku).toFixed(0)}億年後`;
  return `宇宙誕生から${age} (${rel})`;
}

// ---------- スプライト ----------

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText(`▼ ${text}`, 256, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    sizeAttenuation: false,
  }));
  sprite.scale.set(0.28, 0.035, 1);
  sprite.center.set(0.5, -0.35);
  return sprite;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
