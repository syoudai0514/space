import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGalaxy, createBackgroundStars } from './galaxy.js';
import { SolarSystem } from './solarsystem.js';

// ---------- レンダラー ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

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

// ---------- 太陽系シーン ----------
const solar = new SolarSystem();
solar.scene.add(createBackgroundStars(1800, 500));

const solarCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
solarCam.position.set(0, 70, 120);
const solarControls = new OrbitControls(solarCam, canvas);
solarControls.enableDamping = true;
solarControls.minDistance = 8;
solarControls.maxDistance = 400;
solarControls.enabled = false;

// ---------- 状態 ----------
// 銀河: 時間は百万年単位 / 太陽系: 年単位
const modes = {
  galaxy: { t: 0, min: -3000, max: 3000, step: 5, rate: 80 },   // 再生速度 80百万年/秒
  solar:  { t: 0, min: -100, max: 100, step: 0.1, rate: 2 },    // 再生速度 2年/秒
};
let mode = 'galaxy';
let playing = false;

const BASE_DATE = new Date(); // 「現在」の基準

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const timeSlider = $('time-slider');
const timeDisplay = $('time-display');
const playBtn = $('play-btn');
const speedSelect = $('speed-select');
const planetPanel = $('planet-panel');
const panelToggle = $('panel-toggle');
const planetSelect = $('planet-select');
const planetInfo = $('planet-info');
const sizeSlider = $('size-slider');
const massSlider = $('mass-slider');
const sizeValue = $('size-value');
const massValue = $('mass-value');

// 惑星セレクトを構築
for (const p of solar.planets) {
  const opt = document.createElement('option');
  opt.value = p.key;
  opt.textContent = p.name;
  planetSelect.appendChild(opt);
}
planetSelect.value = 'earth';

// ---------- 時間表示 ----------
function formatGalaxyTime(myr) {
  if (Math.abs(myr) < 1) return '現在の銀河系';
  const abs = Math.abs(myr);
  const label = abs >= 100
    ? `${(abs / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}億年`
    : `${abs}百万年`;
  return myr > 0 ? `${label}後の銀河系` : `${label}前の銀河系`;
}

function formatSolarTime(years) {
  const d = new Date(BASE_DATE.getTime() + years * 365.25 * 24 * 3600 * 1000);
  const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (Math.abs(years) < 0.01) return `現在 (${dateStr})`;
  const rel = years > 0 ? `+${years.toFixed(1)}年` : `${years.toFixed(1)}年`;
  return `${dateStr} (${rel})`;
}

function applyTime() {
  const m = modes[mode];
  if (mode === 'galaxy') {
    galaxy.setTime(m.t);
    timeDisplay.textContent = formatGalaxyTime(m.t);
  } else {
    solar.setTime(m.t);
    timeDisplay.textContent = formatSolarTime(m.t);
  }
}

function syncSlider() {
  const m = modes[mode];
  timeSlider.min = m.min;
  timeSlider.max = m.max;
  timeSlider.step = m.step;
  timeSlider.value = m.t;
}

// ---------- モード切替 ----------
function setMode(next) {
  mode = next;
  const isSolar = mode === 'solar';
  $('tab-galaxy').classList.toggle('active', !isSolar);
  $('tab-solar').classList.toggle('active', isSolar);
  galaxyControls.enabled = !isSolar;
  solarControls.enabled = isSolar;
  panelToggle.classList.toggle('hidden', !isSolar);
  if (!isSolar) planetPanel.classList.add('hidden');
  syncSlider();
  applyTime();
}

$('tab-galaxy').addEventListener('click', () => setMode('galaxy'));
$('tab-solar').addEventListener('click', () => setMode('solar'));

// ---------- 時間コントロール ----------
timeSlider.addEventListener('input', () => {
  modes[mode].t = parseFloat(timeSlider.value);
  applyTime();
});

playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '⏸ 停止' : '▶ 再生';
  playBtn.classList.toggle('playing', playing);
});

$('now-btn').addEventListener('click', () => {
  modes[mode].t = 0;
  syncSlider();
  applyTime();
});

// ---------- 惑星パネル ----------
panelToggle.addEventListener('click', () => planetPanel.classList.toggle('hidden'));
$('panel-close').addEventListener('click', () => planetPanel.classList.add('hidden'));

function formatMass(earthMass) {
  if (earthMass >= 10000) return `地球の約${Math.round(earthMass / 1000) * 1000}倍`;
  if (earthMass >= 10) return `地球の約${Math.round(earthMass)}倍`;
  if (earthMass >= 0.95 && earthMass < 1.05) return '地球と同じ';
  return `地球の約${earthMass.toPrecision(2)}倍`;
}

function refreshPanel() {
  const p = solar.getPlanet(planetSelect.value);
  sizeSlider.value = Math.log10(p.sizeScale);
  massSlider.value = Math.log10(p.massScale);
  sizeValue.textContent = `×${p.sizeScale.toFixed(2)}`;
  massValue.textContent = `×${p.massScale.toFixed(2)}`;
  const period = solar.periodOf(p);
  const periodStr = period >= 1 ? `${period.toFixed(1)}年` : `${(period * 365.25).toFixed(0)}日`;
  planetInfo.innerHTML = [
    `<b>${p.name}</b>`,
    `太陽からの距離: ${p.a.toFixed(2)} AU${p.a !== p.baseA ? ' (入れ替え中!)' : ''}`,
    `公転周期: ${periodStr}`,
    `半径: 地球の${(p.baseRadius * p.sizeScale).toPrecision(3)}倍`,
    `質量: ${formatMass(p.baseMass * p.massScale)}`,
  ].join('<br>');
}

planetSelect.addEventListener('change', refreshPanel);

sizeSlider.addEventListener('input', () => {
  const scale = Math.pow(10, parseFloat(sizeSlider.value));
  solar.setSizeScale(planetSelect.value, scale);
  refreshPanel();
});

massSlider.addEventListener('input', () => {
  const scale = Math.pow(10, parseFloat(massSlider.value));
  solar.setMassScale(planetSelect.value, scale);
  refreshPanel();
  applyTime();
});

$('swap-btn').addEventListener('click', () => {
  const swapped = solar.swapEarthJupiter();
  $('swap-btn').textContent = swapped
    ? '🔄 地球 ⇄ 木星 を元に戻す'
    : '🔄 地球 ⇄ 木星 を入れ替え';
  refreshPanel();
});

$('reset-planets-btn').addEventListener('click', () => {
  solar.resetPlanets();
  $('swap-btn').textContent = '🔄 地球 ⇄ 木星 を入れ替え';
  refreshPanel();
});

refreshPanel();

// ---------- タップで惑星を選択 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;

canvas.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (mode !== 'solar' || !downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  if (moved > 8) return; // ドラッグは無視
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, solarCam);
  const hits = raycaster.intersectObjects(solar.meshes, false);
  if (hits.length === 0) return;
  const planet = solar.planets.find((p) => p.mesh === hits[0].object);
  if (planet) {
    planetSelect.value = planet.key;
    refreshPanel();
    planetPanel.classList.remove('hidden');
  }
});

// ---------- ループ ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (playing) {
    const m = modes[mode];
    m.t += m.rate * parseFloat(speedSelect.value) * dt;
    if (m.t > m.max) m.t = m.min; // 端まで来たらループ
    if (m.t < m.min) m.t = m.max;
    timeSlider.value = m.t;
    applyTime();
  }

  if (mode === 'galaxy') {
    galaxyControls.update();
    renderer.render(galaxyScene, galaxyCam);
  } else {
    solarControls.update();
    renderer.render(solar.scene, solarCam);
  }
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  for (const cam of [galaxyCam, solarCam]) {
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
});

setMode('galaxy');
animate();
