'use strict';

/* =========================================================
   Tasca — shop cards in your pocket (PWA)
   Cards and photos live in this device's IndexedDB, settings
   in its localStorage. Nothing is sent anywhere.
   ========================================================= */

const DB_NAME = 'tasca', DB_VERSION = 1;
const SETTINGS_KEY = 'tasca-settings';
const DATA_FILE = 'tasca-data.json';
const COFFEE_URL = 'https://buymeacoffee.com/gionzana';
const GITHUB_URL = 'https://github.com/rb-gith?tab=repositories';
const PHOTO_SIDE = 1280, PHOTO_QUALITY = 0.85;
const SEARCH_FROM = 7;
/* [card colour, text colour] */
const COLORS = [
  ['#E8701A', '#FFFFFF'], ['#D6001C', '#FFFFFF'], ['#0A5C8A', '#FFFFFF'], ['#2E7D46', '#FFFFFF'], ['#6B3FA0', '#FFFFFF'],
  ['#C2185B', '#FFFFFF'], ['#00838F', '#FFFFFF'], ['#3B3B3B', '#FFFFFF'], ['#8D6E63', '#FFFFFF'], ['#F2C14E', '#22252A'],
  ['#9CCC65', '#22252A'], ['#CFD8DC', '#22252A'],
];
const inkFor = c => (COLORS.find(x => x[0] === c) || [c, '#FFFFFF'])[1];

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isDate = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
const isColor = c => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c);
/* Numbers are easier to read aloud in groups of four */
const grouped = v => /^\d{8,}$/.test(v) ? v.replace(/(\d{4})(?=\d)/g, '$1 ') : v;

/* ---------- Settings and language ---------- */
function cleanSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  return { lang: s.lang === 'en' || s.lang === 'it' ? s.lang : null, lastBackup: isDate(s.lastBackup) ? s.lastBackup : null };
}
let settings = cleanSettings(null);
try { settings = cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY))); } catch (e) { /* use the defaults */ }
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage blocked */ } }
const phoneLang = navigator.language || '';
let lang = settings.lang || (/^it\b/i.test(phoneLang) ? 'it' : 'en');
const tr = (key, ...args) => args.reduce((s, a) => s.replace('{}', () => a), TEXT[lang][key]);
const locale = () => phoneLang.toLowerCase().startsWith(lang) ? phoneLang : lang === 'it' ? 'it-IT' : 'en-GB';
function setLang(next) { lang = next; settings.lang = next; saveSettings(); document.documentElement.lang = lang; render(); }
document.documentElement.lang = lang;

/* ---------- Storage ---------- */
let db;
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore('cards', { keyPath: 'id' }); req.result.createObjectStore('photos'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function write(fill) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['cards', 'photos'], 'readwrite');
    fill(tx);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function request(store, method, ...args) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store)[method](...args);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
let askedPersist = false;
function keepData() {
  if (askedPersist) return;
  askedPersist = true;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

/* ---------- Data ---------- */
let cards = [];
const cardById = id => cards.find(c => c.id === id);
const text = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
/* Everything read from a backup file is reduced to known fields and types */
function cleanCard(c) {
  const photoId = v => typeof v === 'string' && /^[a-z0-9]{1,40}$/.test(v) ? v : null;
  return {
    id: String(c.id || uid()).replace(/[^a-z0-9]/gi, '').slice(0, 40) || uid(),
    name: text(c.name, 60),
    number: text(c.number, 300),
    format: typeof c.format === 'string' && /^[a-z0-9_]{1,20}$/.test(c.format) ? c.format : 'code_128',
    color: isColor(c.color) ? c.color : COLORS[0][0],
    note: text(c.note, 500),
    front: photoId(c.front),
    back: photoId(c.back),
    created: Number(c.created) || Date.now(),
    used: Number(c.used) || 0,
  };
}
/* Least recently used at the top of the stack, most recent at the bottom where it shows in full */
const stackOrder = list => list.slice().sort((a, b) => (a.used || a.created) - (b.used || b.created));

/* ---------- Photos: shrunk once, when they are added ---------- */
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
async function shrinkPhoto(file) {
  const { img, url } = await loadImage(file);
  try {
    const scale = Math.min(1, PHOTO_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('resize')), 'image/jpeg', PHOTO_QUALITY));
  } finally {
    URL.revokeObjectURL(url);
  }
}
/* Object URLs for the photos currently on screen */
const shownUrls = [];
function releaseShown() { shownUrls.splice(0).forEach(u => URL.revokeObjectURL(u)); }
async function photoUrl(id) {
  if (!id) return null;
  try {
    const blob = await request('photos', 'get', id);
    if (!blob) return null;
    const u = URL.createObjectURL(blob);
    shownUrls.push(u);
    return u;
  } catch (e) { return null; }
}

/* ---------- Navigation: each page is a history entry, so the phone's back button works ---------- */
const ui = { form: null, draft: null, side: 'front', q: '' };
history.scrollRestoration = 'manual';
const depth = () => (history.state && history.state.d) || 0;
function go(hash) { history.pushState({ d: depth() + 1 }, '', '#' + hash); render(); }
function replace(hash) { history.replaceState({ d: depth() }, '', '#' + hash); render(); }
function back() {
  if (depth() > 0) { history.back(); return; }
  history.replaceState({ d: 0 }, '', location.pathname + location.search);
  render();
}
addEventListener('popstate', render);
function currentRoute() {
  const [name, arg] = location.hash.slice(1).split('/');
  return { name: name || 'wallet', arg: arg ? decodeURIComponent(arg) : null };
}

/* ---------- Rendering ---------- */
const app = $('#app');
let lastKey = null;
function render() {
  if (!db) return;
  const key = location.hash;
  const same = key === lastKey;
  const { name, arg } = currentRoute();
  if (!same) { closeBig(); stopScan(); releaseLock(); if (name !== 'card') releaseShown(); }
  if (name === 'wallet') app.innerHTML = walletHtml();
  else if (name === 'card' && cardById(arg)) { if (!same) { ui.side = 'front'; markUsed(cardById(arg)); } app.innerHTML = cardHtml(cardById(arg)); fillPhotos(cardById(arg)); keepScreenOn(); }
  else if (name === 'scan') { app.innerHTML = scanHtml(); startScan(); }
  else if (name === 'new') { startForm(key, null); app.innerHTML = formHtml(); }
  else if (name === 'edit' && cardById(arg)) { startForm(key, cardById(arg)); app.innerHTML = formHtml(); }
  else if (name === 'menu') app.innerHTML = menuHtml();
  else { back(); return; }
  /* The scanner opened from a form hands its result back to that form, so keep it */
  if (name !== 'new' && name !== 'edit' && name !== 'scan') endForm();
  lastKey = key;
  if (!same) scrollTo(0, name === 'wallet' ? document.body.scrollHeight : 0);
}

const svg = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};
const creditHtml = () => `<footer class="credit">
  <p>${tr('madeBy')} · <a href="${COFFEE_URL}" target="_blank" rel="noopener">${tr('coffee')}</a></p>
  <p>${tr('moreApps', `<a href="${GITHUB_URL}" target="_blank" rel="noopener">github</a>`)}</p>
</footer>`;
const tail = v => v.length > 4 ? '•••• ' + v.slice(-4) : v;

/* ---------- The wallet ---------- */
function walletHtml() {
  const q = ui.q.trim().toLowerCase();
  const list = stackOrder(cards).filter(c => !q || c.name.toLowerCase().includes(q) || c.number.toLowerCase().includes(q));
  const stack = list.map(c => `<button class="wcard" data-act="open" data-id="${esc(c.id)}" style="--c:${c.color};--t:${inkFor(c.color)}">
      <span class="wname">${esc(c.name)}</span><span class="wnum">${esc(tail(c.number))}</span></button>`).join('');
  return `<div class="view">
    <header class="topbar">
      <button class="icon-btn" data-act="menu" aria-label="${tr('menu')}">${svg.menu}</button>
      <h1>${tr('appName')}</h1>
      <button class="add-btn" data-act="add" aria-label="${tr('addCard')}">+</button>
    </header>
    ${cards.length >= SEARCH_FROM ? `<input class="search" id="search" type="search" value="${esc(ui.q)}" placeholder="${tr('search')}" autocomplete="off">` : ''}
    ${cards.length ? (list.length ? `<div class="stack">${stack}</div>` : `<p class="empty">${tr('noMatch')}</p>`)
      : `<div class="empty"><h2>${tr('emptyTitle')}</h2><p>${tr('emptyText')}</p><button class="btn primary wide" data-act="add">+ ${tr('addCard')}</button></div>`}
    ${creditHtml()}
  </div>`;
}
function refreshStack() {
  const box = app.querySelector('.stack, .empty');
  const html = walletHtml();
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const fresh = tmp.querySelector('.stack, .empty');
  if (box && fresh) box.replaceWith(fresh);
}

/* ---------- A card at the till ---------- */
function codeHtml(c) {
  const code = Barcode.svg(c.format, c.number);
  return code
    ? `<button class="code" data-act="big" aria-label="${tr('tapToEnlarge')}">${code}<span class="num">${esc(grouped(c.number))}</span></button><p class="hint">${tr('tapToEnlarge')}</p>`
    : `<div class="code"><span class="num">${esc(grouped(c.number))}</span></div><p class="hint">${tr('cantDraw')}</p>`;
}
function cardHtml(c) {
  const hasBoth = c.front && c.back;
  return `<div class="view">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="${tr('back')}">‹</button>
      <h2>${esc(c.name)}</h2>
      <button class="link-btn" data-act="edit" data-id="${esc(c.id)}">${tr('edit')}</button>
    </header>
    <div class="face" id="face" style="--c:${c.color};--t:${inkFor(c.color)}"><span class="fname">${esc(c.name)}</span></div>
    ${hasBoth ? `<div class="sides"><button data-act="side" data-side="front" aria-pressed="${ui.side === 'front'}">${tr('front')}</button><button data-act="side" data-side="back" aria-pressed="${ui.side === 'back'}">${tr('backSide')}</button></div>` : ''}
    ${codeHtml(c)}
    ${c.note ? `<p class="cnote">${esc(c.note)}</p>` : ''}
    <p class="hint">${tr('screenOn')}</p>
  </div>`;
}
let faceUrls = {};
async function fillPhotos(c) {
  const id = ui.side === 'back' && c.back ? c.back : c.front || c.back;
  if (!id) return;
  if (!faceUrls[id]) faceUrls[id] = await photoUrl(id);
  const face = $('#face');
  if (face && faceUrls[id] && currentRoute().arg === c.id) face.innerHTML = `<img src="${faceUrls[id]}" alt="">`;
}
async function markUsed(c) {
  faceUrls = {};
  const updated = Object.assign({}, c, { used: Date.now() });
  try { await write(tx => tx.objectStore('cards').put(updated)); cards[cards.indexOf(c)] = updated; } catch (e) { /* only the order changes */ }
}
const big = $('#big');
function openBig(c) {
  const code = Barcode.svg(c.format, c.number);
  if (!code) return;
  big.innerHTML = `<div class="inner"><p class="bname">${esc(c.name)}</p>${code}<p class="num">${esc(grouped(c.number))}</p></div>
    <button class="icon-btn" data-act="big-close" aria-label="${tr('close')}">×</button>`;
  big.showModal();
}
function closeBig() { if (big.open) big.close(); }
big.addEventListener('click', () => big.close());

/* Keep the screen on while a card is shown */
let lock = null;
async function keepScreenOn() {
  if (lock || !('wakeLock' in navigator)) return;
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (e) { lock = null; }
}
function releaseLock() { if (lock) { lock.release().catch(() => {}); lock = null; } }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentRoute().name === 'card') keepScreenOn();
});

/* ---------- Scanning with the camera ---------- */
let scan = null;
function scanHtml() {
  return `<div class="view">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="${tr('back')}">‹</button>
      <h2>${tr('scanTitle')}</h2>
    </header>
    <div class="scan"><video id="video" playsinline muted></video><div class="frame"></div></div>
    <p class="scan-msg" id="scan-msg">${tr('scanStarting')}</p>
    <button class="btn wide" data-act="type">${tr('typeInstead')}</button>
  </div>`;
}
async function startScan() {
  const msg = t => { const el = $('#scan-msg'); if (el) el.textContent = t; };
  if (!('BarcodeDetector' in window)) { msg(tr('noScanner')); return; }
  let detector;
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    detector = new BarcodeDetector({ formats: supported.length ? supported : Barcode.FORMATS });
  } catch (e) { msg(tr('noScanner')); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
  catch (e) { msg(tr('noCamera')); return; }
  if (currentRoute().name !== 'scan') { stream.getTracks().forEach(t => t.stop()); return; }
  const video = $('#video');
  video.srcObject = stream;
  try { await video.play(); } catch (e) { /* autoplay is allowed for muted video */ }
  msg(tr('scanHint'));
  const session = { stream, timer: 0, done: false };
  scan = session;
  const tick = async () => {
    if (session.done) return;
    try {
      const found = await detector.detect(video);
      if (found.length && !session.done) {
        session.done = true;
        const hit = found[0];
        if (navigator.vibrate) navigator.vibrate(60);
        if (ui.form) { ui.form.number = hit.rawValue; ui.form.format = hit.format; back(); }
        else { ui.draft = { number: hit.rawValue, format: hit.format }; replace('new'); }
        return;
      }
    } catch (e) { /* the frame wasn't ready yet */ }
    session.timer = setTimeout(tick, 180);
  };
  tick();
}
function stopScan() {
  if (!scan) return;
  scan.done = true;
  clearTimeout(scan.timer);
  scan.stream.getTracks().forEach(t => t.stop());
  scan = null;
}

/* ---------- Add or edit a card ---------- */
function startForm(key, card) {
  if (ui.form && ui.form.key === key) return;
  endForm();
  const d = ui.draft || {};
  ui.draft = null;
  const usedColors = cards.map(c => c.color);
  ui.form = {
    key, card,
    name: card ? card.name : '',
    note: card ? card.note : '',
    color: card ? card.color : (COLORS.find(([c]) => !usedColors.includes(c)) || COLORS[0])[0],
    format: card ? card.format : d.format || 'code_128',
    number: card ? card.number : d.number || '',
    photos: { front: card && card.front ? { id: card.front, saved: true } : null, back: card && card.back ? { id: card.back, saved: true } : null },
    removed: [],
    picking: null,
  };
  if (card) ['front', 'back'].forEach(async side => {
    const p = ui.form.photos[side];
    if (p) { p.url = await photoUrl(p.id); refreshPhotos(); }
  });
}
function endForm() {
  if (!ui.form) return;
  ['front', 'back'].forEach(s => { const p = ui.form.photos[s]; if (p && !p.saved && p.url) URL.revokeObjectURL(p.url); });
  ui.form = null;
}
function formatOptions(selected) {
  const opts = Barcode.FORMATS.map(f => `<option value="${f}" ${f === selected ? 'selected' : ''}>${Barcode.LABELS[f]}</option>`);
  if (!Barcode.FORMATS.includes(selected)) opts.push(`<option value="${esc(selected)}" selected>${esc(tr('formatOther', selected))}</option>`);
  return opts.join('');
}
function formHtml() {
  const f = ui.form, c = f.card;
  return `<div class="view"><form id="card-form" novalidate>
    <header class="topbar">
      <button type="button" class="icon-btn" data-act="back" aria-label="${tr('back')}">‹</button>
      <h2>${c ? tr('editCard') : tr('newCard')}</h2>
      <button class="save-btn">${tr('save')}</button>
    </header>
    <label class="field"><span>${tr('name')}</span>
      <input type="text" name="name" value="${esc(f.name)}" maxlength="60" placeholder="${tr('namePlaceholder')}" autocomplete="off" autocapitalize="words"></label>
    <p class="error" id="name-error" hidden>${tr('nameError')}</p>
    <label class="field"><span>${tr('number')}</span>
      <input type="text" name="number" class="mono" value="${esc(f.number)}" maxlength="300" placeholder="${tr('numberPlaceholder')}" autocomplete="off" inputmode="${/^\d*$/.test(f.number) ? 'numeric' : 'text'}"></label>
    <div class="row-actions"><button type="button" class="link-btn" data-act="rescan">${tr('rescan')}</button></div>
    <label class="field"><span>${tr('format')}</span><select name="format">${formatOptions(f.format)}</select></label>
    <div class="preview" id="preview">${previewHtml()}</div>
    <div class="field"><span class="field-label">${tr('color')}</span>
      <div class="colors">${COLORS.map(([col]) => `<button type="button" data-act="color" data-color="${col}" style="--c:${col}" aria-label="${col}" aria-pressed="${col === f.color}"></button>`).join('')}</div></div>
    <div class="field"><span class="field-label">${tr('photos')}</span><div class="photos" id="photos">${photosHtml()}</div></div>
    <label class="field"><span>${tr('note')}</span>
      <textarea name="note" rows="2" maxlength="500" placeholder="${tr('notePlaceholder')}">${esc(f.note)}</textarea></label>
    ${c ? `<div class="btns"><button type="button" class="btn danger grow" data-act="delete">${tr('delete')}</button></div>` : ''}
  </form></div>`;
}
function previewHtml() {
  const f = ui.form;
  if (!f.number.trim()) return `<p class="hint" style="margin:0">${tr('preview')}</p>`;
  const res = Barcode.check(f.format, f.number);
  if (!res.ok) return `<p class="error" style="margin:0">${esc(tr(res.error, res.n || ''))}</p>`;
  return Barcode.svg(f.format, f.number) || `<p class="hint" style="margin:0">${tr('cantDraw')}</p>`;
}
function refreshPreview() { const p = $('#preview'); if (p && ui.form) p.innerHTML = previewHtml(); }
function photosHtml() {
  return ['front', 'back'].map(side => {
    const p = ui.form.photos[side];
    return p
      ? `<div class="ph">${p.url ? `<img src="${p.url}" alt="">` : ''}<button type="button" class="x" data-act="remove-photo" data-side="${side}" aria-label="${tr('removePhoto')}">×</button></div>`
      : `<button type="button" class="ph-add" data-act="add-photo" data-side="${side}">${svg.camera}${tr(side === 'front' ? 'addFront' : 'addBack')}</button>`;
  }).join('');
}
function refreshPhotos() { const box = $('#photos'); if (box && ui.form) box.innerHTML = photosHtml(); }
async function addPhoto(file) {
  const f = ui.form;
  if (!file || !f || !f.picking) return;
  const side = f.picking;
  toast(tr('preparingPhoto'));
  try {
    const blob = await shrinkPhoto(file);
    if (ui.form !== f) return;
    const old = f.photos[side];
    if (old) { if (old.saved) f.removed.push(old.id); else URL.revokeObjectURL(old.url); }
    f.photos[side] = { id: uid(), saved: false, blob, url: URL.createObjectURL(blob) };
    hideToast();
    refreshPhotos();
  } catch (e) { toast(tr('photoFailed')); }
}
function removePhoto(side) {
  const f = ui.form, p = f.photos[side];
  if (!p) return;
  if (p.saved) f.removed.push(p.id); else URL.revokeObjectURL(p.url);
  f.photos[side] = null;
  refreshPhotos();
}
async function submitCard(form) {
  const f = ui.form;
  const name = form.elements.name.value.trim().slice(0, 60);
  $('#name-error').hidden = !!name;
  const res = Barcode.check(f.format, form.elements.number.value);
  if (!name) { form.elements.name.focus(); return; }
  if (!res.ok) { refreshPreview(); form.elements.number.focus(); return; }
  const old = f.card;
  const card = cleanCard({
    id: old ? old.id : uid(), name, number: res.value, format: f.format, color: f.color,
    note: form.elements.note.value, front: f.photos.front && f.photos.front.id, back: f.photos.back && f.photos.back.id,
    created: old ? old.created : Date.now(), used: old ? old.used : Date.now(),
  });
  const fresh = ['front', 'back'].map(s => f.photos[s]).filter(p => p && !p.saved);
  try {
    await write(tx => {
      tx.objectStore('cards').put(card);
      fresh.forEach(p => tx.objectStore('photos').put(p.blob, p.id));
      f.removed.forEach(id => tx.objectStore('photos').delete(id));
    });
  } catch (e) { toast(tr('saveFailed')); return; }
  if (old) cards[cards.indexOf(old)] = card; else cards.push(card);
  keepData();
  toast(tr('saved'));
  if (old) back(); else replace('card/' + encodeURIComponent(card.id));
}
async function deleteCard(c) {
  if (!confirm(tr('confirmDelete', c.name))) return;
  try {
    await write(tx => {
      tx.objectStore('cards').delete(c.id);
      [c.front, c.back].filter(Boolean).forEach(id => tx.objectStore('photos').delete(id));
    });
  } catch (e) { toast(tr('saveFailed')); return; }
  cards = cards.filter(x => x !== c);
  toast(tr('deleted'));
  history.replaceState({ d: 0 }, '', location.pathname + location.search);
  render();
}

/* ---------- Menu: language and backup ---------- */
function menuHtml() {
  const last = settings.lastBackup ? ' ' + tr('backupLast', new Date(settings.lastBackup + 'T12:00').toLocaleDateString(locale(), { dateStyle: 'medium' })) : '';
  return `<div class="view menu">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="${tr('back')}">‹</button>
      <h2>${tr('menu')}</h2>
    </header>
    <h3>${tr('language')}</h3>
    <div class="seg">
      <button data-act="lang" data-lang="en" aria-pressed="${lang === 'en'}">English</button>
      <button data-act="lang" data-lang="it" aria-pressed="${lang === 'it'}">Italiano</button>
    </div>
    <h3>${tr('backup')}</h3>
    <p class="note">${tr('backupNote')}${last}</p>
    <div class="btns">
      <button class="btn primary" data-act="export">${tr('exportBackup')}</button>
      <label class="btn">${tr('importBackup')}<input type="file" accept=".zip,application/zip,application/x-zip-compressed" id="import-file" hidden></label>
    </div>
    <p class="note" style="margin-top:22px">${tr('onlyShopCards')}</p>
    ${creditHtml()}
  </div>`;
}
function saveFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
async function exportBackup() {
  toast(tr('exporting'));
  try {
    const files = [];
    for (const c of cards) for (const id of [c.front, c.back].filter(Boolean)) {
      const blob = await request('photos', 'get', id);
      if (blob) files.push({ name: `photos/${id}.jpg`, blob });
    }
    files.push({ name: DATA_FILE, blob: new Blob([JSON.stringify({ app: 'tasca', version: 1, cards }, null, 2)], { type: 'application/json' }) });
    saveFile(await ZIP.write(files), `tasca-${todayKey()}.zip`);
    settings.lastBackup = todayKey();
    saveSettings();
    toast(tr('backupSaved'));
    render();
  } catch (e) { toast(tr('backupFailed')); }
}
async function importBackup(file) {
  let data, entries;
  try {
    entries = await ZIP.read(file);
    if (!entries.has(DATA_FILE)) throw new Error('no data');
    data = JSON.parse(await (await entries.get(DATA_FILE)()).text());
    if (!data || data.app !== 'tasca' || !Array.isArray(data.cards)) throw new Error('bad data');
  } catch (e) { toast(tr('notBackup')); return; }
  if (!confirm(tr('confirmImport'))) return;
  toast(tr('importing'));
  const fresh = data.cards.filter(c => c && typeof c === 'object' && typeof c.name === 'string' && c.name.trim() && typeof c.number === 'string' && c.number.trim()).map(cleanCard);
  const photos = [];
  try {
    for (const c of fresh) for (const side of ['front', 'back']) {
      const get = c[side] && entries.get(`photos/${c[side]}.jpg`);
      if (!get) { c[side] = null; continue; }
      try { photos.push({ id: c[side], blob: new Blob([await get()], { type: 'image/jpeg' }) }); } catch (e) { c[side] = null; }
    }
    await write(tx => {
      tx.objectStore('cards').clear();
      tx.objectStore('photos').clear();
      fresh.forEach(c => tx.objectStore('cards').put(c));
      photos.forEach(p => tx.objectStore('photos').put(p.blob, p.id));
    });
  } catch (e) { toast(tr('saveFailed')); return; }
  cards = fresh;
  settings.lastBackup = todayKey();
  saveSettings();
  keepData();
  toast(tr('backupRestored'));
  render();
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 2600);
}
function hideToast() { clearTimeout(toastTimer); $('#toast').hidden = true; }

/* ---------- Events ---------- */
const photoInput = $('#photo-input');
photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  photoInput.value = '';
  addPhoto(file);
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const route = currentRoute();
  switch (b.dataset.act) {
    case 'back': back(); break;
    case 'menu': go('menu'); break;
    case 'add': go('scan'); break;
    case 'type':
      if (ui.form) back();
      else { ui.draft = { number: '', format: 'code_128' }; replace('new'); }
      break;
    case 'rescan': go('scan'); break;
    case 'open': go('card/' + encodeURIComponent(b.dataset.id)); break;
    case 'edit': go('edit/' + encodeURIComponent(b.dataset.id)); break;
    case 'side': {
      ui.side = b.dataset.side;
      const c = cardById(route.arg);
      if (c) { app.innerHTML = cardHtml(c); fillPhotos(c); }
      break;
    }
    case 'big': { const c = cardById(route.arg); if (c) openBig(c); break; }
    case 'big-close': closeBig(); break;
    case 'color':
      ui.form.color = b.dataset.color;
      document.querySelectorAll('[data-act="color"]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      break;
    case 'add-photo': ui.form.picking = b.dataset.side; photoInput.click(); break;
    case 'remove-photo': removePhoto(b.dataset.side); break;
    case 'delete': if (ui.form && ui.form.card) deleteCard(ui.form.card); break;
    case 'lang': setLang(b.dataset.lang); break;
    case 'export': exportBackup(); break;
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'card-form') submitCard(e.target);
});
document.addEventListener('input', e => {
  if (e.target.id === 'search') { ui.q = e.target.value; refreshStack(); return; }
  if (!ui.form) return;
  if (e.target.name === 'name') { ui.form.name = e.target.value; $('#name-error').hidden = true; }
  if (e.target.name === 'note') ui.form.note = e.target.value;
  if (e.target.name === 'number') { ui.form.number = e.target.value; refreshPreview(); }
});
document.addEventListener('change', e => {
  if (e.target.name === 'format' && ui.form) { ui.form.format = e.target.value; refreshPreview(); return; }
  if (e.target.id === 'import-file') {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importBackup(file);
  }
});

/* ---------- Start ---------- */
(async () => {
  app.innerHTML = `<p class="hint">${tr('loading')}</p>`;
  try {
    db = await openDb();
    cards = (await request('cards', 'getAll')).map(cleanCard);
  } catch (e) {
    db = null;
    app.innerHTML = `<p class="hint">${tr('storageError')}</p>`;
    return;
  }
  render();
})();

/* ---------- Offline support ---------- */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
