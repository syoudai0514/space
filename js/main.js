import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGalaxy, createBackgroundStars } from './galaxy.js?v=8';
import { SolarSystem, POS_SCALE, EARTH_MASS } from './solarsystem.js?v=8';
import { createUniverse, epochInfo, formatUniverseTime, NOW_GYR, END_GYR } from './universe.js?v=8';
import { createAtoms, atomEpochInfo, formatAtomTime, ATOM_LOG_MIN, ATOM_LOG_MAX } from './atoms.js?v=8';

// ---------- レンダラー ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// ---------- 太陽系シーン ----------
const solar = new SolarSystem();

const solarCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.005, 6000);
solarCam.position.set(0, 30, 65);
const solarControls = new OrbitControls(solarCam, canvas);
solarControls.enableDamping = true;
solarControls.minDistance = 0.02;
solarControls.maxDistance = 1800;

// ---------- 銀河シーン ----------
const galaxyScene = new THREE.Scene();
const galaxy = createGalaxy();
galaxyScene.add(galaxy.group);
galaxyScene.add(createBackgroundStars());

const galaxyCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
galaxyCam.position.set(0, 17, 26);
const galaxyControls = new OrbitControls(galaxyCam, canvas);
galaxyControls.enableDamping = true;
galaxyControls.minDistance = 4;
galaxyControls.maxDistance = 120;
galaxyControls.enabled = false;

// ---------- 宇宙の歴史シーン ----------
const universe = createUniverse();

const universeCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 4000);
universeCam.position.set(0, 35, 85);
const universeControls = new OrbitControls(universeCam, canvas);
universeControls.enableDamping = true;
universeControls.minDistance = 0.3; // 銀河1つ1つに寄れる
universeControls.maxDistance = 500;
universeControls.enabled = false;

// ---------- 原子の誕生シーン ----------
const atoms = createAtoms();

const atomsCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
atomsCam.position.set(0, 7, 30);
const atomsControls = new OrbitControls(atomsCam, canvas);
atomsControls.enableDamping = true;
atomsControls.minDistance = 4;
atomsControls.maxDistance = 90;
atomsControls.enabled = false;

// ---------- 状態 ----------
let mode = 'solar';          // 'solar' | 'galaxy' | 'universe'
let solarPlaying = true;
let galaxyPlaying = false;
let galaxyTime = 0;          // 百万年
const GALAXY_RANGE = 3000;
const GALAXY_RATE = 80;      // 再生速度 80百万年/秒
let universePlaying = false;
let universeS = 0;           // 宇宙の歴史スライダー位置 (0〜1)
let atomsPlaying = false;
let atomsS = 0;              // 原子の誕生スライダー位置 (0〜1)
const atomsSliderToYears = (s) => Math.pow(10, ATOM_LOG_MIN + s * (ATOM_LOG_MAX - ATOM_LOG_MIN));
let followKey = null;        // 追従中の天体キー
const BASE_DATE = new Date(); // 「現在」の基準

// 宇宙の歴史スライダー:
//   [0, U_FLASH]   … 誕生の瞬間(無 → ビッグバンの閃光)
//   [U_FLASH, U_SPLIT] … 対数スケール(最初の3分〜10億年の大事件を引き伸ばす)
//   [U_SPLIT, 1]   … 線形(10億年〜238億年)
const U_FLASH = 0.05;
const U_SPLIT = 0.45;
const U_LOG_MIN = -15;       // 10^-15 十億年 ≈ 30秒
function sliderToGyr(s) {
  if (s <= 0) return 0; // 宇宙誕生前の「無」
  if (s <= U_FLASH) return Math.pow(10, -19 + (s / U_FLASH) * 4); // 閃光ゾーン
  if (s <= U_SPLIT) {
    return Math.pow(10, U_LOG_MIN + ((s - U_FLASH) / (U_SPLIT - U_FLASH)) * (0 - U_LOG_MIN));
  }
  return 1 + ((s - U_SPLIT) / (1 - U_SPLIT)) * (END_GYR - 1);
}
function gyrToSlider(t) {
  if (t <= 0) return 0;
  if (t <= 1e-15) return U_FLASH * (Math.log10(Math.max(t, 1e-19)) + 19) / 4;
  if (t <= 1) {
    return U_FLASH + (U_SPLIT - U_FLASH) * (Math.log10(t) - U_LOG_MIN) / (0 - U_LOG_MIN);
  }
  return U_SPLIT + ((t - 1) / (END_GYR - 1)) * (1 - U_SPLIT);
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const timeDisplay = $('time-display');
const playBtn = $('play-btn');
const speedSelect = $('speed-select');
const galaxySpeedSelect = $('galaxy-speed-select');
const galaxySlider = $('galaxy-slider');
const universeSlider = $('universe-slider');
const atomsSlider = $('atoms-slider');
const epochDisplay = $('epoch-display');
const nowBtn = $('now-btn');
const resetBtn = $('reset-btn');
const clearTrailsBtn = $('clear-trails-btn');
const planetPanel = $('planet-panel');
const panelToggle = $('panel-toggle');
const bodySelect = $('body-select');
const bodyInfo = $('body-info');
const sizeSlider = $('size-slider');
const massSlider = $('mass-slider');
const distSlider = $('dist-slider');
const distField = $('dist-field');
const sizeValue = $('size-value');
const massValue = $('mass-value');
const distValue = $('dist-value');
const exaggSlider = $('exagg-slider');
const exaggValue = $('exagg-value');
const followBtn = $('follow-btn');
const circularizeBtn = $('circularize-btn');
const swapField = $('swap-field');
const swapSelect = $('swap-select');
const swapBtn = $('swap-btn');

// 天体セレクトを構築
for (const b of solar.bodies) {
  const opt = document.createElement('option');
  opt.value = b.key;
  opt.textContent = b.name;
  bodySelect.appendChild(opt);
}
bodySelect.value = 'earth';

// ---------- トースト通知 ----------
const toasts = $('toasts');
function toast(msg) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  toasts.appendChild(div);
  setTimeout(() => div.classList.add('fade'), 3600);
  setTimeout(() => div.remove(), 4400);
}
solar.onEvent = toast;

// ---------- 時間表示 ----------
function formatSolarTime(years) {
  const d = new Date(BASE_DATE.getTime() + years * 365.25 * 24 * 3600 * 1000);
  const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return `${dateStr} (+${years.toFixed(2)}年)`;
}

function formatGalaxyTime(myr) {
  if (Math.abs(myr) < 1) return '現在の銀河系';
  const abs = Math.abs(myr);
  const label = abs >= 100
    ? `${(abs / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}億年`
    : `${Math.round(abs)}百万年`;
  return myr > 0 ? `${label}後の銀河系` : `${label}前の銀河系`;
}

function updateTimeDisplay() {
  if (mode === 'solar') {
    timeDisplay.textContent = formatSolarTime(solar.time);
  } else if (mode === 'galaxy') {
    timeDisplay.textContent = formatGalaxyTime(galaxyTime);
  } else if (mode === 'universe') {
    const t = sliderToGyr(universeS);
    timeDisplay.textContent = formatUniverseTime(t);
    const epoch = epochInfo(t);
    epochDisplay.innerHTML = `<b>${epoch.title}</b> ${epoch.desc}`;
  } else {
    const t = atomsSliderToYears(atomsS);
    timeDisplay.textContent = formatAtomTime(t);
    const epoch = atomEpochInfo(t);
    epochDisplay.innerHTML = `<b>${epoch.title}</b> ${epoch.desc}`
      + '<br>🔴陽子 ⚪中性子 🔵電子 🟡光';
  }
}

// ---------- モード切替 ----------
function isPlaying() {
  if (mode === 'solar') return solarPlaying;
  if (mode === 'galaxy') return galaxyPlaying;
  if (mode === 'universe') return universePlaying;
  return atomsPlaying;
}

function updatePlayBtn() {
  const p = isPlaying();
  playBtn.textContent = p ? '⏸ 停止' : '▶ 再生';
  playBtn.classList.toggle('playing', p);
}

function setMode(next) {
  mode = next;
  const isSolar = mode === 'solar';
  const isGalaxy = mode === 'galaxy';
  const isUniverse = mode === 'universe';
  const isAtoms = mode === 'atoms';
  $('tab-solar').classList.toggle('active', isSolar);
  $('tab-galaxy').classList.toggle('active', isGalaxy);
  $('tab-universe').classList.toggle('active', isUniverse);
  $('tab-atoms').classList.toggle('active', isAtoms);
  solarControls.enabled = isSolar;
  galaxyControls.enabled = isGalaxy;
  universeControls.enabled = isUniverse;
  atomsControls.enabled = isAtoms;
  // UIの出し分け
  panelToggle.classList.toggle('hidden', !isSolar);
  speedSelect.classList.toggle('hidden', !isSolar);
  resetBtn.classList.toggle('hidden', !isSolar);
  clearTrailsBtn.classList.toggle('hidden', !isSolar);
  galaxySlider.classList.toggle('hidden', !isGalaxy);
  galaxySpeedSelect.classList.toggle('hidden', isSolar);
  nowBtn.classList.toggle('hidden', !isGalaxy && !isUniverse);
  universeSlider.classList.toggle('hidden', !isUniverse);
  atomsSlider.classList.toggle('hidden', !isAtoms);
  epochDisplay.classList.toggle('hidden', !isUniverse && !isAtoms);
  if (!isSolar) planetPanel.classList.add('hidden');
  updatePlayBtn();
  updateTimeDisplay();
}

$('tab-solar').addEventListener('click', () => setMode('solar'));
$('tab-galaxy').addEventListener('click', () => setMode('galaxy'));
$('tab-universe').addEventListener('click', () => setMode('universe'));
$('tab-atoms').addEventListener('click', () => setMode('atoms'));

// ---------- 再生コントロール ----------
playBtn.addEventListener('click', () => {
  if (mode === 'solar') solarPlaying = !solarPlaying;
  else if (mode === 'galaxy') galaxyPlaying = !galaxyPlaying;
  else if (mode === 'universe') {
    // 終端で再生したら最初(ビッグバン)から
    if (!universePlaying && universeS >= 0.999) universeS = 0;
    universePlaying = !universePlaying;
  } else {
    if (!atomsPlaying && atomsS >= 0.999) atomsS = 0;
    atomsPlaying = !atomsPlaying;
  }
  updatePlayBtn();
});

resetBtn.addEventListener('click', () => {
  solar.reset();
  followKey = null;
  updateFollowBtn();
  updateTimeDisplay();
  refreshPanel();
  toast('↺ 最初の状態に戻しました');
});

clearTrailsBtn.addEventListener('click', () => {
  solar.clearAllTrails();
});

galaxySlider.addEventListener('input', () => {
  galaxyTime = parseFloat(galaxySlider.value);
  galaxy.setTime(galaxyTime);
  updateTimeDisplay();
});

nowBtn.addEventListener('click', () => {
  if (mode === 'galaxy') {
    galaxyTime = 0;
    galaxySlider.value = 0;
    galaxy.setTime(0);
  } else if (mode === 'universe') {
    universeS = gyrToSlider(NOW_GYR);
    universeSlider.value = universeS;
    universe.setTime(NOW_GYR);
  }
  updateTimeDisplay();
});

universeSlider.addEventListener('input', () => {
  universeS = parseFloat(universeSlider.value);
  universe.setTime(sliderToGyr(universeS));
  updateTimeDisplay();
});

atomsSlider.addEventListener('input', () => {
  atomsS = parseFloat(atomsSlider.value);
  updateTimeDisplay();
});

// ---------- 天体パネル ----------
panelToggle.addEventListener('click', () => planetPanel.classList.toggle('hidden'));
$('panel-close').addEventListener('click', () => planetPanel.classList.add('hidden'));

function formatEarthMass(solarMass) {
  const em = solarMass / EARTH_MASS;
  if (em >= 10000) return `地球の約${Math.round(em / 1000) * 1000}倍`;
  if (em >= 10) return `地球の約${Math.round(em)}倍`;
  if (em >= 0.95 && em < 1.05) return '地球と同じ';
  return `地球の約${em.toPrecision(2)}倍`;
}

function refreshInfo() {
  const b = solar.getBody(bodySelect.value);
  const sun = solar.bodies[0];
  const lines = [`<b>${b.name}</b>`];
  if (!b.alive) {
    lines.push('🔥 太陽に飲み込まれました(リセットで復活)');
  } else {
    if (b.escaped) lines.push('🚀 太陽系のかなたへ…');
    if (b.key !== 'sun') {
      const r = b.pos.distanceTo(sun.pos);
      const v = b.vel.clone().sub(sun.vel).length() * 4.74; // AU/年 → km/s
      lines.push(`太陽からの距離: ${r.toFixed(2)} AU`);
      lines.push(`速度: ${v.toFixed(1)} km/s`);
    }
    const radiusKm = b.radiusKm * b.sizeScale;
    lines.push(`半径: ${Math.round(radiusKm).toLocaleString()} km (地球の${(radiusKm / 6371).toPrecision(3)}倍)`);
    lines.push(b.key === 'sun'
      ? `質量: 太陽の${solar.effMass(b).toPrecision(3)}倍`
      : `質量: ${formatEarthMass(solar.effMass(b))}`);
  }
  bodyInfo.innerHTML = lines.join('<br>');
}

function refreshPanel() {
  const b = solar.getBody(bodySelect.value);
  sizeSlider.value = Math.log10(b.sizeScale);
  massSlider.value = Math.log10(b.massScale);
  sizeValue.textContent = `×${b.sizeScale.toFixed(2)}`;
  massValue.textContent = `×${b.massScale.toFixed(2)}`;
  exaggValue.textContent = `×${Math.round(solar.exaggeration)}`;
  exaggSlider.value = Math.log10(solar.exaggeration);
  const isSun = b.key === 'sun';
  const planetEditable = !isSun && b.alive;
  distField.classList.toggle('hidden', !planetEditable);
  circularizeBtn.classList.toggle('hidden', !planetEditable);
  swapField.classList.toggle('hidden', !b.alive);
  if (planetEditable) {
    const r = b.pos.distanceTo(solar.bodies[0].pos);
    distSlider.value = Math.log10(Math.max(r, 0.05));
    distValue.textContent = `${r.toFixed(2)} AU`;
  }
  if (b.alive) {
    // 入れ替え相手のセレクトを作り直す(自分と消滅した惑星は除く。太陽も選べる)
    const prev = swapSelect.value;
    swapSelect.innerHTML = '';
    for (const other of solar.bodies) {
      if (other.key === b.key || !other.alive) continue;
      const opt = document.createElement('option');
      opt.value = other.key;
      opt.textContent = other.name;
      swapSelect.appendChild(opt);
    }
    if ([...swapSelect.options].some((o) => o.value === prev)) swapSelect.value = prev;
  }
  updateFollowBtn();
  refreshInfo();
}

bodySelect.addEventListener('change', refreshPanel);

sizeSlider.addEventListener('input', () => {
  const scale = Math.pow(10, parseFloat(sizeSlider.value));
  solar.setSizeScale(bodySelect.value, scale);
  sizeValue.textContent = `×${scale.toFixed(2)}`;
  refreshInfo();
});

massSlider.addEventListener('input', () => {
  const scale = Math.pow(10, parseFloat(massSlider.value));
  solar.setMassScale(bodySelect.value, scale);
  massValue.textContent = `×${scale.toFixed(2)}`;
  refreshInfo();
});

distSlider.addEventListener('input', () => {
  const au = Math.pow(10, parseFloat(distSlider.value));
  solar.setDistanceAU(bodySelect.value, au);
  distValue.textContent = `${au.toFixed(2)} AU`;
  refreshInfo();
});

exaggSlider.addEventListener('input', () => {
  const e = Math.pow(10, parseFloat(exaggSlider.value));
  solar.setExaggeration(e);
  exaggValue.textContent = `×${Math.round(e)}`;
});

circularizeBtn.addEventListener('click', () => {
  const b = solar.getBody(bodySelect.value);
  solar.circularize(b.key);
  toast(`⭕ ${b.name}を円軌道に乗せました`);
  refreshPanel();
});

swapBtn.addEventListener('click', () => {
  const a = solar.getBody(bodySelect.value);
  const b = solar.getBody(swapSelect.value);
  if (!b) return;
  solar.swapBodies(a.key, b.key);
  toast(`🔄 ${a.name}と${b.name}の場所を入れ替えました`);
  refreshPanel();
});

// ---------- 追従カメラ ----------
function updateFollowBtn() {
  const active = followKey !== null && followKey === bodySelect.value;
  followBtn.textContent = active ? '🎯 追従中 (タップで解除)' : '🎯 この天体を追いかける';
  followBtn.classList.toggle('active', active);
}

followBtn.addEventListener('click', () => {
  const key = bodySelect.value;
  if (followKey === key) {
    followKey = null;
  } else {
    followKey = key;
    const b = solar.getBody(key);
    if (b.alive) {
      // カメラを天体の近くへ寄せる
      const target = b.pos.clone().multiplyScalar(POS_SCALE);
      const dir = solarCam.position.clone().sub(solarControls.target).normalize();
      const dist = Math.min(
        Math.max(solar.displayRadius(b) * 14, 0.15),
        solarCam.position.distanceTo(target)
      );
      solarControls.target.copy(target);
      solarCam.position.copy(target).addScaledVector(dir, dist);
    }
  }
  updateFollowBtn();
});

function applyFollow() {
  if (!followKey) return;
  const b = solar.getBody(followKey);
  if (!b.alive) { followKey = null; updateFollowBtn(); return; }
  const target = b.pos.clone().multiplyScalar(POS_SCALE);
  const delta = target.clone().sub(solarControls.target);
  solarControls.target.copy(target);
  solarCam.position.add(delta);
}

// ---------- タップ選択 & ドラッグ移動 (太陽系モードのみ) ----------
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let pointerState = null; // { id, key, downX, downY, dragging, plane }

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'solar' || pointerState) return;
  const hit = solar.pickBody(solarCam, e.clientX, e.clientY, innerWidth, innerHeight);
  if (!hit) return;
  pointerState = { id: e.pointerId, key: hit.key, downX: e.clientX, downY: e.clientY, dragging: false, plane: null };
  solarControls.enabled = false; // このジェスチャー中は視点操作を止める
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointerState || e.pointerId !== pointerState.id) return;
  const moved = Math.hypot(e.clientX - pointerState.downX, e.clientY - pointerState.downY);
  if (!pointerState.dragging && moved > 8) {
    pointerState.dragging = true; // ドラッグ開始(シミュレーションは一時停止)
    const b = solar.getBody(pointerState.key);
    pointerState.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -b.pos.y * POS_SCALE);
  }
  if (pointerState.dragging) {
    pointerNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointerNdc, solarCam);
    const out = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(pointerState.plane, out)) {
      solar.setDisplayPosition(pointerState.key, out);
    }
  }
});

function endPointer(e, cancelled) {
  if (!pointerState || e.pointerId !== pointerState.id) return;
  if (pointerState.dragging) {
    solar.clearTrail(pointerState.key); // 軌跡を引き直す
    refreshPanel();
  } else if (!cancelled) {
    // タップ → 天体を選択してパネルを開く
    bodySelect.value = pointerState.key;
    refreshPanel();
    planetPanel.classList.remove('hidden');
  }
  pointerState = null;
  solarControls.enabled = mode === 'solar';
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));

// ---------- メインループ ----------
const clock = new THREE.Clock();
let infoTick = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (mode === 'solar') {
    const dragging = pointerState !== null && pointerState.dragging;
    if (solarPlaying && !dragging) {
      solar.advance(parseFloat(speedSelect.value) * dt);
      updateTimeDisplay();
    }
    solar.syncVisuals();
    applyFollow();
    solarControls.update();
    renderer.render(solar.scene, solarCam);

    // パネルの数値を定期的に更新
    if (!planetPanel.classList.contains('hidden') && ++infoTick % 15 === 0) {
      refreshInfo();
    }
  } else if (mode === 'galaxy') {
    if (galaxyPlaying) {
      galaxyTime += GALAXY_RATE * parseFloat(galaxySpeedSelect.value) * dt;
      if (galaxyTime > GALAXY_RANGE) galaxyTime = -GALAXY_RANGE; // 端まで来たらループ
      galaxySlider.value = galaxyTime;
      galaxy.setTime(galaxyTime);
      updateTimeDisplay();
    }
    galaxyControls.update();
    renderer.render(galaxyScene, galaxyCam);
  } else if (mode === 'universe') {
    if (universePlaying) {
      // スライダー空間を一定速度で進む(全史をちょうどいいテンポで再生)
      universeS += 0.022 * parseFloat(galaxySpeedSelect.value) * dt;
      if (universeS >= 1) { universeS = 1; universePlaying = false; updatePlayBtn(); }
      universeSlider.value = universeS;
      universe.setTime(sliderToGyr(universeS));
      updateTimeDisplay();
    }
    universeControls.update();
    renderer.render(universe.scene, universeCam);
  } else {
    if (atomsPlaying) {
      atomsS += 0.03 * parseFloat(galaxySpeedSelect.value) * dt;
      if (atomsS >= 1) { atomsS = 1; atomsPlaying = false; updatePlayBtn(); }
      atomsSlider.value = atomsS;
      updateTimeDisplay();
    }
    atoms.update(clock.elapsedTime, atomsSliderToYears(atomsS));
    atomsControls.update();
    renderer.render(atoms.scene, atomsCam);
  }
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  for (const cam of [solarCam, galaxyCam, universeCam, atomsCam]) {
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
  }
});

refreshPanel();
setMode('solar');
updateTimeDisplay();
animate();
