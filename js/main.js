import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SolarSystem, POS_SCALE, EARTH_MASS } from './solarsystem.js';

// ---------- レンダラー / シーン ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const solar = new SolarSystem();

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.005, 6000);
camera.position.set(0, 30, 65);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.02;
controls.maxDistance = 1800;

// ---------- 状態 ----------
let playing = true;
let followKey = null;        // 追従中の天体キー
const BASE_DATE = new Date(); // 「現在」の基準

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const timeDisplay = $('time-display');
const playBtn = $('play-btn');
const speedSelect = $('speed-select');
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
function formatTime(years) {
  const d = new Date(BASE_DATE.getTime() + years * 365.25 * 24 * 3600 * 1000);
  const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return `${dateStr} (+${years.toFixed(2)}年)`;
}
timeDisplay.textContent = formatTime(0);

// ---------- 再生コントロール ----------
playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '⏸ 停止' : '▶ 再生';
  playBtn.classList.toggle('playing', playing);
});

$('reset-btn').addEventListener('click', () => {
  solar.reset();
  followKey = null;
  updateFollowBtn();
  timeDisplay.textContent = formatTime(0);
  refreshPanel();
  toast('↺ 最初の状態に戻しました');
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
  distField.classList.toggle('hidden', isSun);
  if (!isSun && b.alive) {
    const r = b.pos.distanceTo(solar.bodies[0].pos);
    distSlider.value = Math.log10(Math.max(r, 0.05));
    distValue.textContent = `${r.toFixed(2)} AU`;
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
      const dir = camera.position.clone().sub(controls.target).normalize();
      const dist = Math.min(
        Math.max(solar.displayRadius(b) * 14, 0.15),
        camera.position.distanceTo(target)
      );
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist);
    }
  }
  updateFollowBtn();
});

function applyFollow() {
  if (!followKey) return;
  const b = solar.getBody(followKey);
  if (!b.alive) { followKey = null; updateFollowBtn(); return; }
  const target = b.pos.clone().multiplyScalar(POS_SCALE);
  const delta = target.clone().sub(controls.target);
  controls.target.copy(target);
  camera.position.add(delta);
}

// ---------- タップ選択 & ドラッグ移動 ----------
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let pointerState = null; // { id, key, downX, downY, dragging, plane }

canvas.addEventListener('pointerdown', (e) => {
  if (pointerState) return;
  const hit = solar.pickBody(camera, e.clientX, e.clientY, innerWidth, innerHeight);
  if (!hit) return;
  pointerState = { id: e.pointerId, key: hit.key, downX: e.clientX, downY: e.clientY, dragging: false, plane: null };
  controls.enabled = false; // このジェスチャー中は視点操作を止める
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
    raycaster.setFromCamera(pointerNdc, camera);
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
  controls.enabled = true;
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));

// ---------- メインループ ----------
const clock = new THREE.Clock();
let infoTick = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const dragging = pointerState !== null && pointerState.dragging;

  if (playing && !dragging) {
    solar.advance(parseFloat(speedSelect.value) * dt);
    timeDisplay.textContent = formatTime(solar.time);
  }

  solar.syncVisuals();
  applyFollow();
  controls.update();
  renderer.render(solar.scene, camera);

  // パネルの数値を定期的に更新
  if (!planetPanel.classList.contains('hidden') && ++infoTick % 15 === 0) {
    refreshInfo();
  }
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

refreshPanel();
animate();
