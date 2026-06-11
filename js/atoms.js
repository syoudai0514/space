// 原子の誕生モード。
// ビッグバン直後のミクロの世界: 素粒子のスープ → 原子核合成(3分) →
// プラズマの霧 → 再結合(38万年)で原子が完成、までを粒子アニメで描く。
// 時間スライダーはどちらに動かしても破綻しないよう、
// すべての状態を「時刻の関数」として決定的に計算している。

import * as THREE from 'three';

export const ATOM_LOG_MIN = -7.5; // 10^-7.5 年 ≈ 1秒
export const ATOM_LOG_MAX = 6.5;  // ≈ 316万年

const FUSION_LOG = Math.log10(5.7e-6);  // 原子核合成(3分)
const RECOMB_LOG = Math.log10(3.8e5);   // 再結合(38万年)

const HE_COUNT = 6;    // ヘリウム原子核(陽子2+中性子2)
const H_COUNT = 30;    // 水素原子核(陽子1)
const PHOTON_COUNT = 56;
const REGION = 13;     // 粒子が漂う領域の半径

const COLORS = {
  proton: 0xff6b4a,
  neutron: 0xd5dbe4,
  electron: 0x55c8ff,
  photon: 0xffe98a,
};

function rand(seed) {
  // 決定的な疑似乱数(seedごとに固定)
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function randVec(seed, scale) {
  return new THREE.Vector3(
    (rand(seed) - 0.5) * 2,
    (rand(seed + 1) - 0.5) * 2,
    (rand(seed + 2) - 0.5) * 2
  ).multiplyScalar(scale);
}

// なめらかで決定的なゆらぎ運動
function wander(out, base, seed, t, amp) {
  out.set(
    Math.sin(t * 1.10 + seed * 7.3) + 0.5 * Math.sin(t * 2.31 + seed * 3.1),
    Math.sin(t * 0.93 + seed * 5.7) + 0.5 * Math.sin(t * 2.70 + seed * 9.4),
    Math.sin(t * 1.27 + seed * 2.9) + 0.5 * Math.sin(t * 1.93 + seed * 6.2)
  ).multiplyScalar(amp).add(base);
  return out;
}

const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export function createAtoms() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const dotTex = makeDotTexture();
  const ringTex = makeRingTexture();

  const makeSprite = (color, scale) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex,
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    s.scale.setScalar(scale);
    scene.add(s);
    return s;
  };

  let seedCounter = 1;
  const nextSeed = () => (seedCounter += 17.7);

  // ---------- 原子核 ----------
  // He: 陽子2+中性子2が3分ごろ合体。H: 陽子1個のまま
  const nuclei = [];
  for (let n = 0; n < HE_COUNT + H_COUNT; n++) {
    const isHe = n < HE_COUNT;
    const base = randVec(nextSeed(), REGION * 0.8);
    const members = [];
    if (isHe) {
      for (let m = 0; m < 4; m++) {
        members.push({
          sprite: makeSprite(m < 2 ? COLORS.proton : COLORS.neutron, 0.85),
          freeBase: randVec(nextSeed(), REGION * 0.8),
          seed: nextSeed(),
          // 合体後の核内での位置(ぎゅっと固まった4つ玉)
          offset: randVec(nextSeed(), 0.22),
        });
      }
    } else {
      members.push({
        sprite: makeSprite(COLORS.proton, 0.85),
        freeBase: base,
        seed: nextSeed(),
        offset: new THREE.Vector3(),
      });
    }
    // 合体の瞬間の閃光
    const flash = isHe ? makeSprite(0xffffff, 0.1) : null;
    if (flash) flash.material.opacity = 0;
    // 原子になったときの電子軌道リング
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringTex,
      color: 0x88bbff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    ring.scale.setScalar(isHe ? 2.6 : 2.2);
    scene.add(ring);

    nuclei.push({
      isHe,
      base,
      seed: nextSeed(),
      fusionLog: FUSION_LOG + (rand(n * 3.3) - 0.5) * 0.5,
      members,
      flash,
      ring,
      pos: new THREE.Vector3(),
    });
  }

  // ---------- 電子(He=2個, H=1個で電荷がつり合う) ----------
  const electrons = [];
  for (const [ni, nu] of nuclei.entries()) {
    const count = nu.isHe ? 2 : 1;
    for (let e = 0; e < count; e++) {
      electrons.push({
        sprite: makeSprite(COLORS.electron, 0.42),
        freeBase: randVec(nextSeed(), REGION * 0.85),
        seed: nextSeed(),
        nucleus: nu,
        captureLog: RECOMB_LOG + (rand(ni * 7.7 + e) - 0.5) * 0.55,
        orbitR: nu.isHe ? 0.85 + e * 0.35 : 1.0,
        phase: rand(ni * 13.1 + e) * Math.PI * 2,
        tilt: randVec(nextSeed(), 1).normalize(),
      });
    }
  }

  // ---------- 光子 ----------
  const photons = [];
  for (let p = 0; p < PHOTON_COUNT; p++) {
    photons.push({
      sprite: makeSprite(COLORS.photon, 0.5),
      base: randVec(nextSeed(), REGION),
      seed: nextSeed(),
      dir: randVec(nextSeed(), 1).normalize(), // 晴れ上がり後の直進方向
    });
  }

  // animT: 実時間(秒)、tYears: 宇宙の時刻(年)
  function update(animT, tYears) {
    const L = Math.log10(Math.max(tYears, Math.pow(10, ATOM_LOG_MIN)));
    // 温度が下がると動きがゆっくりに
    const calm = smooth(L, -6, RECOMB_LOG + 1);
    const speed = THREE.MathUtils.lerp(5.0, 0.45, calm);
    const amp = THREE.MathUtils.lerp(3.0, 0.9, calm);
    const t = animT * speed;

    // 原子核
    for (const nu of nuclei) {
      // 核(または将来核になる場所)のいまの位置
      wander(nu.pos, nu.base, nu.seed, animT * speed * 0.55, amp * 0.8);
      const fused = nu.isHe ? smooth(L, nu.fusionLog - 0.2, nu.fusionLog + 0.08) : 1;
      for (const m of nu.members) {
        if (nu.isHe) {
          wander(_v1, m.freeBase, m.seed, t, amp);           // 合体前: 自由に飛ぶ
          _v2.copy(nu.pos).add(m.offset);                     // 合体後: 核として固まる
          m.sprite.position.copy(_v1.lerp(_v2, fused));
        } else {
          m.sprite.position.copy(nu.pos);
        }
      }
      // 合体の瞬間の閃光(スライダーをまたいだ時だけ光る)
      if (nu.flash) {
        const d = (L - nu.fusionLog) / 0.1;
        const glow = Math.exp(-d * d);
        nu.flash.material.opacity = glow * 0.9;
        nu.flash.scale.setScalar(0.4 + glow * 2.2);
        nu.flash.position.copy(nu.pos);
      }
    }

    // 電子: 自由 → 原子核のまわりの軌道へ
    let captured = 0;
    for (const el of electrons) {
      const c = smooth(L, el.captureLog - 0.18, el.captureLog + 0.1);
      captured += c;
      wander(_v1, el.freeBase, el.seed, t * 1.8, amp * 1.15); // 電子は軽くて速い
      // 軌道運動(傾いた円)
      const ang = animT * 2.6 + el.phase;
      _v2.set(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(el.orbitR);
      _v2.applyAxisAngle(el.tilt, 1.0).add(el.nucleus.pos);
      el.sprite.position.copy(_v1.lerp(_v2, c));
    }

    // 原子の軌道リング: その核の電子が捕まったら浮かび上がる
    for (const nu of nuclei) {
      let sum = 0, n = 0;
      for (const el of electrons) {
        if (el.nucleus === nu) { sum += smooth(L, el.captureLog - 0.18, el.captureLog + 0.1); n++; }
      }
      nu.ring.material.opacity = (n ? sum / n : 0) * 0.4;
      nu.ring.position.copy(nu.pos);
    }

    // 光子: 散乱(ジグザグ) → 晴れ上がりで直進して飛び去る
    const clear = smooth(L, RECOMB_LOG - 0.1, RECOMB_LOG + 0.6);
    for (const ph of photons) {
      wander(_v1, ph.base, ph.seed, animT * 9, 3.4); // 高速ジグザグ
      _v1.addScaledVector(ph.dir, clear * 150);       // 直進して画面外へ
      ph.sprite.position.copy(_v1);
      ph.sprite.material.opacity = 1 - clear * 0.98;
    }

    // 背景: 灼熱 → オレンジ → 晴れ上がりで真っ暗
    const heat = 1 - smooth(L, ATOM_LOG_MIN, RECOMB_LOG);
    const hot = new THREE.Color(1.0, 0.96, 0.88);
    const warm = new THREE.Color(1.0, 0.42, 0.10);
    scene.background.copy(hot.lerp(warm, 1 - heat)).multiplyScalar(0.30 * (1 - clear));
  }

  update(0, Math.pow(10, ATOM_LOG_MIN));
  return { scene, update };
}

// ---------- 時代の解説 ----------

export function atomEpochInfo(tYears) {
  const sec = tYears * 3.156e7;
  if (sec < 60) return {
    title: '🍲 灼熱の素粒子スープ',
    desc: '陽子・中性子・電子が光に揉まれて飛び回る。熱すぎて何もくっつけない',
  };
  if (sec < 1200) return {
    title: '⚛️ ビッグバン原子核合成',
    desc: '3分ごろ、宇宙が10億℃まで冷えると陽子と中性子が合体! ヘリウム原子核が次々と生まれる(ピカッ)',
  };
  if (tYears < 3.0e5) return {
    title: '🌫 プラズマの霧',
    desc: '原子核と電子はまだバラバラ。光は電子にぶつかってジグザグにしか進めず、宇宙は霧の中',
  };
  if (tYears < 8e5) return {
    title: '🎉 原子の誕生!',
    desc: '約3000℃まで冷えると電子が原子核に捕まり、水素とヘリウムの原子が完成。光はまっすぐ進めるように(晴れ上がり)',
  };
  return {
    title: '🌌 中性の宇宙へ',
    desc: 'できたての原子たちは静かに漂い、やがて重力で集まって最初の星の材料になる',
  };
}

export function formatAtomTime(tYears) {
  const sec = tYears * 3.156e7;
  let age;
  if (sec < 120) age = `${Math.max(sec, 1).toFixed(0)}秒`;
  else if (sec < 7200) age = `${(sec / 60).toFixed(0)}分`;
  else if (tYears < 1) age = `${Math.max(tYears * 365.25, 1).toFixed(0)}日`;
  else if (tYears < 1e4) age = `${tYears.toFixed(0)}年`;
  else age = `${(tYears / 1e4).toFixed(0)}万年`;
  // 放射優勢期の温度: T ≈ 1.5×10^10 K / √t(秒)
  const T = 1.5e10 / Math.sqrt(Math.max(sec, 1));
  let temp;
  if (T >= 1e8) temp = `約${(T / 1e8).toFixed(0)}億℃`;
  else if (T >= 1e4) temp = `約${(T / 1e4).toFixed(0)}万℃`;
  else temp = `約${T.toFixed(0)}℃`;
  return `ビッグバンから${age} (温度 ${temp})`;
}

// ---------- テクスチャ ----------

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeRingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}
