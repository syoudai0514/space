// 宇宙の歴史モード。
// ビッグバン(138億年前)から100億年後までの宇宙の膨張と銀河の進化を描く。
// 膨張は実際の宇宙論(ΛCDMモデル: 物質+ダークエネルギー)のスケール因子
//   a(t) = (Ωm/ΩΛ)^(1/3) · sinh^(2/3)( (3/2)·√ΩΛ·H0·t )
// を使用。現在(t=138億年)で a=1 になるよう正規化している。
//
// 銀河は1つ1つがテクスチャ付きのビルボード(渦巻・楕円・不規則)なので、
// ズームすると渦巻の腕まで見える。

import * as THREE from 'three';

export const NOW_GYR = 13.8;   // 現在の宇宙年齢(十億年)
export const END_GYR = 23.8;   // シミュレーション終端(=100億年後)
export const FLASH_END = 1e-15; // 誕生の閃光演出の終わり(≈30秒後)

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
  attribute vec3 iPos;   // 共動座標
  attribute float aBirth;
  attribute float aSize;
  attribute float aTint;
  attribute float aTex;  // テクスチャ番号(0〜3)
  attribute float aRot;  // 見た目の回転
  attribute float aFlat; // 傾き(円盤を斜めから見た潰れ)
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
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

    // ビルボード: 銀河自体は膨張しない(膨張するのは銀河の「間」の空間)
    vec2 corner = position.xy;
    corner.y *= aFlat;
    float cr = cos(aRot), sr = sin(aRot);
    corner = mat2(cr, sr, -sr, cr) * corner;
    vec4 mv = modelViewMatrix * vec4(iPos * uA, 1.0);
    mv.xy += corner * aSize;

    // 2x2テクスチャアトラスから自分の絵を選ぶ
    vUv = (uv + vec2(mod(aTex, 2.0), floor(aTex / 2.0))) * 0.5;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * t.rgb, a);
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
  const tex = new Float32Array(total);
  const rot = new Float32Array(total);
  const flat = new Float32Array(total);

  let i = 0;
  const put = (x, y, z) => {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    // 誕生時刻: ほとんどが2〜15億年(最初の銀河の時代)
    birth[i] = Math.min(0.2 + Math.abs(gaussian()) * 0.55, 3.0);
    size[i] = 0.5 + Math.random() * 0.8 + Math.pow(Math.random(), 6) * 2.2;
    tint[i] = Math.random();
    const r = Math.random();
    tex[i] = r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.88 ? 2 : 3; // 渦巻多め
    rot[i] = Math.random() * Math.PI * 2;
    // 楕円銀河はあまり潰さない、円盤銀河は斜めから見える
    flat[i] = tex[i] === 2 ? 0.75 + Math.random() * 0.25 : 0.3 + Math.random() * 0.7;
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

  // 「私たちの天の川銀河」は実在する銀河インスタンスから渦巻銀河を1つ選ぶ
  // (マーカーが本物の銀河の位置に正確に張り付く)
  let mwIndex = -1;
  for (let n = 0; n < total; n++) {
    const d = Math.hypot(pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]);
    if (tex[n] <= 1 && d > 6 && d < 16) {
      mwIndex = n;
      if (size[n] > 1.2) break; // 大きめの渦巻が見つかったら確定
    }
  }
  if (mwIndex < 0) mwIndex = 0;
  size[mwIndex] = Math.max(size[mwIndex], 1.5);  // 見つけやすい大きさに
  birth[mwIndex] = Math.min(birth[mwIndex], 0.5); // 天の川銀河は早生まれ
  const mwPos = new THREE.Vector3(pos[mwIndex * 3], pos[mwIndex * 3 + 1], pos[mwIndex * 3 + 2]);
  const mwBirth = birth[mwIndex];
  const mwSize = size[mwIndex];

  // インスタンス描画: 1枚の四角形ポリゴンを銀河の数だけ使い回す
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birth, 1));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  geo.setAttribute('aTex', new THREE.InstancedBufferAttribute(tex, 1));
  geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 1));
  geo.setAttribute('aFlat', new THREE.InstancedBufferAttribute(flat, 1));
  geo.instanceCount = total;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RADIUS * 3);

  const uniforms = {
    uTime: { value: 0 },
    uA: { value: 1 },
    uMap: { value: makeGalaxyAtlas() },
  };
  const galaxies = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }));
  galaxies.frustumCulled = false;
  scene.add(galaxies);

  // 火の玉宇宙の光球(晴れ上がりで消える)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(glow);

  // ビッグバンの閃光(誕生の瞬間だけ画面いっぱいに広がる)
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  flash.visible = false;
  scene.add(flash);

  // 私たちの天の川銀河の目印(テキスト + 3D空間に固定されたリング)
  const mwLabel = makeLabel('私たちの天の川銀河');
  scene.add(mwLabel);
  const mwRing = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRingTexture(),
    color: 0xffd97a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }));
  mwRing.scale.setScalar(mwSize * 2.6); // 銀河を囲む大きさ(ワールド座標)
  scene.add(mwRing);

  const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

  function setTime(tGyr) {
    const a = scaleFactor(tGyr);
    uniforms.uTime.value = tGyr;
    uniforms.uA.value = a;
    // 天の川銀河マーカー: 選んだ銀河の位置に正確に追従(膨張と一緒に動く)
    const mwShow = smooth(tGyr, mwBirth + 0.15, mwBirth + 0.6);
    mwLabel.visible = mwShow > 0.01;
    mwRing.visible = mwShow > 0.01;
    mwLabel.material.opacity = mwShow;
    mwRing.material.opacity = mwShow * 0.75;
    mwLabel.position.copy(mwPos).multiplyScalar(a);
    mwRing.position.copy(mwPos).multiplyScalar(a);

    // ---------- 誕生の瞬間 (〜30秒後): 無 → 一点の光 → 閃光が膨張 ----------
    if (tGyr < FLASH_END) {
      if (tGyr <= 0) {
        // 「無」: なにもない真っ暗
        scene.background.setRGB(0, 0, 0);
        glow.visible = false;
        flash.visible = false;
        return;
      }
      const p = THREE.MathUtils.clamp((Math.log10(tGyr) + 19) / 4, 0, 1);
      // 一点の光が生まれて育つ
      glow.visible = true;
      glow.material.color.setRGB(1, 1, 1);
      glow.material.opacity = smooth(p, 0.0, 0.12);
      glow.scale.setScalar(THREE.MathUtils.lerp(0.12, 6, smooth(p, 0.1, 1)));
      // 閃光の波が画面を覆って広がっていく
      const wave = smooth(p, 0.25, 0.6) * (1 - smooth(p, 0.75, 1));
      flash.visible = wave > 0.001;
      flash.material.opacity = wave;
      flash.scale.setScalar(2 + Math.pow(p, 2) * 320);
      // 背景: 真っ暗 → 一瞬白く灼ける → 火の玉宇宙の色へ(p=1で下の処理と連続)
      const wPeak = smooth(p, 0.35, 0.7) * (1 - smooth(p, 0.75, 1));
      const settle = smooth(p, 0.75, 1);
      scene.background.setRGB(0.55, 0.53, 0.5).multiplyScalar(settle)
        .lerp(new THREE.Color(1, 1, 1), wPeak);
      return;
    }

    // ---------- 火の玉宇宙 → 晴れ上がり → それ以降 ----------
    const logT = Math.log10(Math.max(tGyr, 1e-15));
    const heat = 1 - smooth(logT, -15, Math.log10(T_RECOMB));            // 1=超高温
    const clear = smooth(logT, Math.log10(T_RECOMB), Math.log10(T_RECOMB * 30)); // 晴れ上がり進行

    const hot = new THREE.Color(1.0, 0.97, 0.9);   // 白熱
    const warm = new THREE.Color(1.0, 0.45, 0.12); // 晴れ上がり直前のオレンジ
    const fireball = hot.clone().lerp(warm, 1 - heat);

    // 背景色: プラズマ時代は宇宙全体が光っている
    scene.background.copy(fireball).multiplyScalar(0.55 * (1 - clear));

    // 光球: 膨張しながら冷えて、晴れ上がりで消える
    flash.visible = false;
    glow.material.color.copy(fireball);
    glow.material.opacity = 1 - clear;
    glow.scale.setScalar(Math.max(a * RADIUS * 2.6, 6));
    glow.visible = clear < 0.999;
  }

  setTime(0);
  return { scene, setTime };
}

// ---------- 時代の解説 ----------

export function epochInfo(tGyr) {
  if (tGyr <= 0) return {
    title: '🕳 宇宙誕生前',
    desc: '時間も空間もまだ存在しない。▶ 再生 でビッグバン!',
  };
  if (tGyr < 5.7e-15) return {
    title: '💥 ビッグバン!!',
    desc: '宇宙のはじまり。超高温・超高密度の一点から、時間と空間そのものが膨張を始める',
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
    desc: '銀河どうしが衝突・合体しながら大きく成長していく。宇宙でもっとも星の誕生が盛んな時代(ズームで銀河に近づける)',
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
  if (tGyr <= 0) return 'まだ時間も空間もない';
  if (tGyr < 1e-16) return 'ビッグバンの瞬間!';
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

// ---------- 銀河のテクスチャ(2x2アトラス: 渦巻×2・楕円・不規則) ----------

function makeGalaxyAtlas() {
  const SIZE = 1024;
  const TILE = SIZE / 2;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');

  drawSpiral(ctx, TILE * 0.5, TILE * 0.5, TILE * 0.46, 2);   // 左上: 2本腕の渦巻
  drawSpiral(ctx, TILE * 1.5, TILE * 0.5, TILE * 0.46, 3);   // 右上: 3本腕の渦巻
  drawElliptical(ctx, TILE * 0.5, TILE * 1.5, TILE * 0.4);   // 左下: 楕円銀河
  drawIrregular(ctx, TILE * 1.5, TILE * 1.5, TILE * 0.4);    // 右下: 不規則銀河

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function blob(ctx, x, y, r, alpha, hue = '255,255,255') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${hue},${alpha})`);
  g.addColorStop(1, `rgba(${hue},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawSpiral(ctx, cx, cy, R, arms) {
  // 中心のバルジ
  blob(ctx, cx, cy, R * 0.28, 1.0, '255,245,220');
  blob(ctx, cx, cy, R * 0.5, 0.35, '255,238,205');
  // 対数螺旋の腕に沿って星の塊をばらまく
  for (let arm = 0; arm < arms; arm++) {
    const base = (arm / arms) * Math.PI * 2;
    for (let s = 0; s < 260; s++) {
      const t = s / 260;
      const theta = base + t * Math.PI * 1.9;
      const r = R * (0.12 + 0.88 * Math.pow(t, 0.85));
      const jitter = R * 0.05 * (1 + t);
      const x = cx + Math.cos(theta) * r + (Math.random() - 0.5) * jitter;
      const y = cy + Math.sin(theta) * r + (Math.random() - 0.5) * jitter;
      const fade = 1 - t * 0.55;
      blob(ctx, x, y, R * (0.02 + Math.random() * 0.05), 0.1 * fade, '225,235,255');
      if (Math.random() < 0.1) blob(ctx, x, y, R * 0.015, 0.5 * fade); // 明るい星形成領域
    }
  }
  // 円盤全体のうっすらした光
  blob(ctx, cx, cy, R, 0.1, '210,225,255');
}

function drawElliptical(ctx, cx, cy, R) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.78);
  blob(ctx, 0, 0, R * 0.3, 1.0, '255,240,215');
  blob(ctx, 0, 0, R * 0.65, 0.4, '255,235,205');
  blob(ctx, 0, 0, R, 0.18, '250,230,205');
  ctx.restore();
}

function drawIrregular(ctx, cx, cy, R) {
  for (let n = 0; n < 26; n++) {
    const ang = Math.random() * Math.PI * 2;
    const d = Math.pow(Math.random(), 1.4) * R * 0.75;
    const x = cx + Math.cos(ang) * d;
    const y = cy + Math.sin(ang) * d * 0.8;
    blob(ctx, x, y, R * (0.08 + Math.random() * 0.16), 0.25 + Math.random() * 0.3, '220,232,255');
  }
  blob(ctx, cx, cy, R * 0.5, 0.3, '235,240,255');
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

function makeRingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 5;
  ctx.setLineDash([22, 14]); // 破線リングでマーカーらしく
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.stroke();
  return new THREE.CanvasTexture(c);
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
