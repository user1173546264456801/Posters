/* Poster Studio — générateur de texture 1024×1024 avec alpha pour la map VRChat.
 * Tout tourne dans le navigateur : aucune image n'est envoyée sur un serveur.
 *
 * Réglages par zone :
 *   rect   : rectangle de la zone dans la texture finale (px, texture 1024×1024)
 *   world  : proportions réelles du poster en jeu (le cadre d'édition utilise ce ratio,
 *            puis l'image est étirée dans `rect` à l'export, comme le fait l'UV en jeu)
 *   quad   : coins (HG, HD, BD, BG) de la zone dans le screenshot, pour l'aperçu en scène
 *   grade  : retouche appliquée à l'export (luminosité, saturation)
 */
const TEX = 1024;
const ZONES = [
  {
    id: 'mural', label: 'Peinture murale', world: [965, 490],
    rect: { x: 30, y: 18, w: 965, h: 490 },
    shot: 'assets/scene-mural.jpg', shotSize: [1630, 1066],
    quad: [[86.0, 306.7], [1621.2, -211.0], [1798.9, 739.4], [68.1, 968.5]],
    grade: { brightness: 0.8, saturate: 0.9 },
  },
  {
    id: 'pub', label: 'Pub extérieure', world: [355, 900],
    rect: { x: 0, y: 520, w: 355, h: 500 },
    shot: 'assets/scene-pub.jpg', shotSize: [697, 1066],
    quad: [[223, 160], [538, 160], [528, 680], [215, 735]],
    grade: null,
  },
  {
    id: 'affiche', label: "Affiche d'accueil", world: [310, 500],
    rect: { x: 360, y: 520, w: 310, h: 500 },
    shot: 'assets/scene-affiche.jpg', shotSize: [697, 1066],
    quad: [[166, 119], [542, 116], [561, 671], [167, 716]],
    grade: null,
  },
];

const $ = (s, r = document) => r.querySelector(s);
const state = Object.fromEntries(ZONES.map(z => [z.id, null])); // validated: {img, k, cx, cy, bg}
let alphaData = null; // Uint8ClampedArray (1 byte / px)
const maskCache = {};

/* ---------- Boot ---------- */
loadImage(window.ALPHA_SRC).then(img => {
  const c = makeCanvas(TEX, TEX);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, TEX, TEX);
  const d = ctx.getImageData(0, 0, TEX, TEX).data;
  alphaData = new Uint8ClampedArray(TEX * TEX);
  for (let i = 0; i < alphaData.length; i++) alphaData[i] = d[i * 4];
});
buildScenes();
updateProgress();

function buildScenes() {
  const root = $('#scenes');
  for (const z of ZONES) {
    const el = document.createElement('article');
    el.className = 'scene';
    el.dataset.id = z.id;
    el.innerHTML = `
      <img class="shot" src="${z.shot}" alt="${z.label} dans la map" width="${z.shotSize[0]}" height="${z.shotSize[1]}" draggable="false">
      <canvas class="overlay" width="${z.rect.w}" height="${z.rect.h}"></canvas>
      <div class="badge"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <button class="edit" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        <span>Personnaliser</span>
      </button>
      <div class="label"><strong>${z.label}</strong><span>${z.world[0]} × ${z.world[1]}</span></div>`;
    root.appendChild(el);
    $('.edit', el).addEventListener('click', () => openEditor(z));
    // Glisser une image directement sur la vignette
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('drag');
      const f = [...(e.dataTransfer.files || [])].find(f => f.type.startsWith('image/'));
      if (f) openEditor(z, f);
    });
  }
  new ResizeObserver(() => ZONES.forEach(placeOverlay)).observe(root);
}

/* ---------- Scene overlay (perspective preview) ---------- */
function placeOverlay(z) {
  const el = $(`.scene[data-id="${z.id}"]`);
  const shot = $('.shot', el), cv = $('.overlay', el);
  const sx = shot.clientWidth / z.shotSize[0], sy = shot.clientHeight / z.shotSize[1];
  const q = z.quad.map(([x, y]) => [x * sx, y * sy]);
  const w = z.rect.w, h = z.rect.h;
  const [a, b, c, d, e, f, g, hh] = squareToQuad(q);
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  cv.style.transform = `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${c},${f},0,1)`;
}

function squareToQuad(p) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

function refreshScene(z) {
  const el = $(`.scene[data-id="${z.id}"]`);
  const s = state[z.id];
  el.classList.toggle('done', !!s);
  $('.edit span', el).textContent = s ? 'Modifier' : 'Personnaliser';
  if (!s) return;
  const cv = $('.overlay', el);
  const { w, h } = z.rect;
  const ctx = cv.getContext('2d');
  const tmp = makeCanvas(w, h);
  const tctx = tmp.getContext('2d');
  drawZone(tctx, z, s, 0, 0);
  const img = tctx.getImageData(0, 0, w, h);
  applyGrade(img.data, z.grade);
  applyMask(img.data, z.rect, w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(img, 0, 0);
  placeOverlay(z);
}

/* ---------- Rendering helpers ---------- */
function coverScale(z, img) {
  return Math.max(z.world[0] / img.naturalWidth, z.world[1] / img.naturalHeight);
}

// Dessine la zone (fond + image) dans un rectangle de la taille de `rect`, en (ox, oy)
function drawZone(ctx, z, s, ox, oy) {
  const [FW, FH] = z.world, { w, h } = z.rect;
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, w, h); ctx.clip();
  ctx.fillStyle = s.bg; ctx.fillRect(ox, oy, w, h);
  ctx.setTransform(w / FW, 0, 0, h / FH, ox, oy); // cadre "monde" → rectangle texture
  const sc = coverScale(z, s.img) * s.k;
  const dw = s.img.naturalWidth * sc, dh = s.img.naturalHeight * sc;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.img, s.cx - dw / 2, s.cy - dh / 2, dw, dh);
  ctx.restore();
}

// Luminosité puis saturation (mêmes formules que les filtres CSS / Photoshop-like)
function applyGrade(px, grade) {
  if (!grade) return;
  const b = grade.brightness, s = grade.saturate;
  const m = [
    .2126 + .7874 * s, .7152 - .7152 * s, .0722 - .0722 * s,
    .2126 - .2126 * s, .7152 + .2848 * s, .0722 - .0722 * s,
    .2126 - .2126 * s, .7152 - .7152 * s, .0722 + .9278 * s,
  ].map(v => v * b);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], bl = px[i + 2];
    px[i] = m[0] * r + m[1] * g + m[2] * bl;
    px[i + 1] = m[3] * r + m[4] * g + m[5] * bl;
    px[i + 2] = m[6] * r + m[7] * g + m[8] * bl;
  }
}

function applyMask(px, rect, w, h) {
  if (!alphaData) return;
  for (let y = 0; y < h; y++) {
    const row = (rect.y + y) * TEX + rect.x;
    for (let x = 0; x < w; x++) px[(y * w + x) * 4 + 3] = alphaData[row + x];
  }
}

// Calque "zone non visible" pour l'éditeur
function maskOverlay(z) {
  if (maskCache[z.id]) return maskCache[z.id];
  const { x, y, w, h } = z.rect;
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const a = alphaData ? alphaData[(y + j) * TEX + x + i] : 255;
    const o = (j * w + i) * 4;
    img.data[o] = 8; img.data[o + 1] = 6; img.data[o + 2] = 16;
    img.data[o + 3] = (255 - a) * 0.78;
  }
  ctx.putImageData(img, 0, 0);
  if (alphaData) maskCache[z.id] = c;
  return c;
}

/* ---------- Editor ---------- */
const ed = {
  zone: null, draft: null,
  modal: $('#editor'), stage: $('#stage'), wrap: $('#stageWrap'),
  imgCv: $('#imgCanvas'), maskCv: $('#maskCanvas'),
  zoom: $('#zoom'), bg: $('#bgColor'), validate: $('#validateBtn'), toolbar: $('#toolbar'),
  f: 1, // px écran par unité "monde"
};
const ZMIN = 0.2, ZMAX = 5; // zoom relatif à "remplir"
const zToSlider = k => Math.round(1000 * Math.log(k / ZMIN) / Math.log(ZMAX / ZMIN));
const sliderToZ = v => ZMIN * Math.pow(ZMAX / ZMIN, v / 1000);

function openEditor(z, file) {
  ed.zone = z;
  ed.draft = state[z.id] ? { ...state[z.id] } : null;
  $('#edTitle').textContent = z.label;
  $('#edMeta').textContent = `Format idéal ${z.world[0]} × ${z.world[1]} (ratio ${(z.world[0] / z.world[1]).toFixed(2)})` +
    (z.grade ? ' · luminosité 80 % et saturation −10 % appliquées' : '');
  ed.stage.classList.toggle('mural', !!z.grade);
  ed.modal.hidden = false;
  document.body.style.overflow = 'hidden';
  layoutStage();
  syncUI();
  if (file) loadFile(file);
}

function closeModal(m) {
  m.hidden = true;
  if ($('#editor').hidden && $('#result').hidden) document.body.style.overflow = '';
}

function layoutStage() {
  const z = ed.zone; if (!z || ed.modal.hidden) return;
  const cs = getComputedStyle(ed.wrap);
  const aw = ed.wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = ed.wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const [FW, FH] = z.world;
  ed.f = Math.min(aw / FW, ah / FH);
  const sw = Math.floor(FW * ed.f), sh = Math.floor(FH * ed.f);
  ed.stage.style.width = sw + 'px'; ed.stage.style.height = sh + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [ed.imgCv, ed.maskCv]) { c.width = Math.round(sw * dpr); c.height = Math.round(sh * dpr); }
  const mctx = ed.maskCv.getContext('2d');
  mctx.clearRect(0, 0, ed.maskCv.width, ed.maskCv.height);
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(maskOverlay(z), 0, 0, ed.maskCv.width, ed.maskCv.height);
  render();
}
new ResizeObserver(layoutStage).observe($('#stageWrap'));

function render() {
  const c = ed.imgCv, ctx = c.getContext('2d'), d = ed.draft;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  if (!d) return;
  const r = c.width / ed.zone.world[0];
  ctx.fillStyle = d.bg; ctx.fillRect(0, 0, c.width, c.height);
  const sc = coverScale(ed.zone, d.img) * d.k;
  const dw = d.img.naturalWidth * sc, dh = d.img.naturalHeight * sc;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(d.img, (d.cx - dw / 2) * r, (d.cy - dh / 2) * r, dw * r, dh * r);
}

function syncUI() {
  const has = !!ed.draft;
  ed.stage.classList.toggle('has-img', has);
  ed.toolbar.classList.toggle('locked', !has);
  ed.validate.disabled = !has;
  if (has) { ed.zoom.value = zToSlider(ed.draft.k); ed.bg.value = ed.draft.bg; }
  render();
}

async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return toast('Ce fichier n’est pas une image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const [FW, FH] = ed.zone.world;
    ed.draft = { img, k: 1, cx: FW / 2, cy: FH / 2, bg: ed.draft?.bg || '#000000' };
    syncUI();
  } catch { toast('Impossible de lire cette image.'); }
}

function setZoom(k, px, py) { // px, py : point fixe en unités monde
  const d = ed.draft; if (!d) return;
  k = Math.min(ZMAX, Math.max(ZMIN, k));
  if (px == null) { px = ed.zone.world[0] / 2; py = ed.zone.world[1] / 2; }
  d.cx = px + (d.cx - px) * (k / d.k);
  d.cy = py + (d.cy - py) * (k / d.k);
  d.k = k;
  ed.zoom.value = zToSlider(k);
  render();
}

// Pointeurs : glisser + pincer
const ptrs = new Map();
let pinch = null;
const toWorld = e => {
  const r = ed.stage.getBoundingClientRect();
  return [(e.clientX - r.left) / ed.f, (e.clientY - r.top) / ed.f];
};
ed.stage.addEventListener('pointerdown', e => {
  if (!ed.draft || e.target.closest('.drop')) return;
  ed.stage.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, toWorld(e));
  ed.stage.classList.add('grabbing');
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), k: ed.draft.k, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  }
});
ed.stage.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId) || !ed.draft) return;
  const prev = ptrs.get(e.pointerId), cur = toWorld(e);
  ptrs.set(e.pointerId, cur);
  if (ptrs.size === 1) {
    ed.draft.cx += cur[0] - prev[0];
    ed.draft.cy += cur[1] - prev[1];
    render();
  } else if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ed.draft.cx += mid[0] - pinch.mid[0]; ed.draft.cy += mid[1] - pinch.mid[1];
    pinch.mid = mid;
    setZoom(pinch.k * dist / pinch.dist, mid[0], mid[1]);
  }
});
const endPtr = e => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (!ptrs.size) ed.stage.classList.remove('grabbing');
};
ed.stage.addEventListener('pointerup', endPtr);
ed.stage.addEventListener('pointercancel', endPtr);
ed.stage.addEventListener('wheel', e => {
  if (!ed.draft) return;
  e.preventDefault();
  const [px, py] = toWorld(e);
  setZoom(ed.draft.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), px, py);
}, { passive: false });

ed.zoom.addEventListener('input', () => setZoom(sliderToZ(+ed.zoom.value)));
ed.bg.addEventListener('input', () => { if (ed.draft) { ed.draft.bg = ed.bg.value; render(); } });
$('#fitBtn').addEventListener('click', () => {
  if (!ed.draft) return;
  const [FW, FH] = ed.zone.world;
  Object.assign(ed.draft, { k: 1, cx: FW / 2, cy: FH / 2 });
  syncUI();
});
$('#replaceBtn').addEventListener('click', () => $('#fileInput').click());
$('#dropZone').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });

ed.stage.addEventListener('dragover', e => { e.preventDefault(); ed.stage.classList.add('dragover'); });
ed.stage.addEventListener('dragleave', () => ed.stage.classList.remove('dragover'));
ed.stage.addEventListener('drop', e => {
  e.preventDefault(); ed.stage.classList.remove('dragover');
  loadFile([...(e.dataTransfer.files || [])].find(f => f.type.startsWith('image/')));
});
window.addEventListener('paste', e => {
  if (ed.modal.hidden) return;
  const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

ed.validate.addEventListener('click', () => {
  if (!ed.draft) return;
  state[ed.zone.id] = { ...ed.draft };
  refreshScene(ed.zone);
  updateProgress();
  closeModal(ed.modal);
  const next = ZONES.find(z => !state[z.id]);
  if (next) toast(`${ZONES.filter(z => state[z.id]).length}/3 · prochaine : ${next.label}`);
});

document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.closest('.modal'))));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) closeModal(m); }));
window.addEventListener('keydown', e => {
  const open = [...document.querySelectorAll('.modal')].find(m => !m.hidden);
  if (!open) return;
  if (e.key === 'Escape') closeModal(open);
  if (e.key === 'Enter' && open === ed.modal && !ed.validate.disabled && e.target.tagName !== 'INPUT') ed.validate.click();
});

function updateProgress() {
  const n = ZONES.filter(z => state[z.id]).length;
  $('#progressText').textContent = `${n}/3`;
  document.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i < n));
  $('#generateBtn').disabled = n < 3;
  $('#ctaHint').textContent = n < 3
    ? `Personnalise les ${3 - n === 3 ? '3' : 3 - n} emplacement${3 - n > 1 ? 's' : ''} restant${3 - n > 1 ? 's' : ''} pour débloquer la génération.`
    : 'Tout est prêt. Tu obtiendras un PNG 1024 × 1024 à m’envoyer.';
}

/* ---------- Export ---------- */
let lastBlobUrl = null;
$('#generateBtn').addEventListener('click', async () => {
  const btn = $('#generateBtn');
  btn.classList.add('busy');
  try {
    const blob = await buildTexture();
    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = URL.createObjectURL(blob);
    $('#resultImg').src = lastBlobUrl;
    $('#downloadBtn').href = lastBlobUrl;
    updateFileName();
    $('#result').hidden = false;
    document.body.style.overflow = 'hidden';
  } catch (err) {
    console.error(err);
    toast('La génération a échoué, réessaie.');
  } finally { btn.classList.remove('busy'); }
});

const pseudoInput = $('#pseudo');
try { pseudoInput.value = localStorage.getItem('ps-pseudo') || ''; } catch {}
pseudoInput.addEventListener('input', () => { updateFileName(); try { localStorage.setItem('ps-pseudo', pseudoInput.value); } catch {} });
function updateFileName() {
  const slug = pseudoInput.value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  $('#downloadBtn').download = slug ? `posters_${slug}.png` : 'posters.png';
}

async function buildTexture() {
  const c = makeCanvas(TEX, TEX), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, TEX, TEX);
  for (const z of ZONES) drawZone(ctx, z, state[z.id], z.rect.x, z.rect.y);
  const img = ctx.getImageData(0, 0, TEX, TEX);
  const px = img.data;
  for (const z of ZONES) if (z.grade) {
    const { x, y, w, h } = z.rect;
    const sub = ctx.getImageData(x, y, w, h);
    applyGrade(sub.data, z.grade);
    for (let j = 0; j < h; j++) px.set(sub.data.subarray(j * w * 4, (j + 1) * w * 4), ((y + j) * TEX + x) * 4);
  }
  for (let i = 0; i < TEX * TEX; i++) px[i * 4 + 3] = alphaData[i];
  // Encodeur PNG maison : garde les couleurs intactes sous l'alpha (pas de pré-multiplication)
  if ('CompressionStream' in window) return encodePNG(TEX, TEX, px);
  const out = makeCanvas(TEX, TEX);
  out.getContext('2d').putImageData(img, 0, 0);
  return new Promise(r => out.toBlob(r, 'image/png'));
}

/* ---------- Minimal PNG encoder (RGBA 8-bit) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const b = new Uint8Array(12 + data.length), v = new DataView(b.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  b.set(data, 8);
  v.setUint32(8 + data.length, crc32(b.subarray(4, 8 + data.length)));
  return b;
}
async function encodePNG(w, h, px) {
  const stride = w * 4, raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1), s = y * stride;
    raw[o] = 1; // filtre "Sub"
    for (let i = 0; i < stride; i++) raw[o + 1 + i] = (px[s + i] - (i >= 4 ? px[s + i - 4] : 0)) & 255;
  }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new Blob([sig, chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array())], { type: 'image/png' });
}

/* ---------- Utils ---------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
let toastTimer;
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}
