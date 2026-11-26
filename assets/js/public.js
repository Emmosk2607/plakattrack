import { supabase, CHUNK, $, escapeHtml } from './config.js';
import { getExifData, compressToDataUrl, detectWarnings, simpleHash } from './exif.js';

let events = [];
let pending = [];          // { dataUrl, previewUrl, gps, timestamp, hash, name }
let storedHashes = new Set();

const els = {
  ma: $('#sel-ma'), event: $('#sel-event'),
  dz: $('#dropzone'), file: $('#file-input'), count: $('#dz-count'),
  thumbs: $('#thumbs'), progress: $('#progress'), bar: $('#progress-bar'),
  err: $('#err'), ok: $('#ok'), submit: $('#submit-btn'),
};

function showErr(msg) { els.err.textContent = msg; els.err.classList.remove('hidden'); els.ok.classList.add('hidden'); }
function clearMsg() { els.err.classList.add('hidden'); els.ok.classList.add('hidden'); }

async function init() {
  try {
    const [{ data: ma }, { data: ev }] = await Promise.all([
      supabase.from('mitarbeiter').select('*').order('name', { ascending: true }),
      supabase.from('events').select('*').order('created_at', { ascending: true }),
    ]);
    events = ev || [];
    (ma || []).forEach(m => els.ma.add(new Option(m.name, m.name)));
    events
      .filter(e => (e.status ?? 'aktiv') === 'aktiv')
      .forEach(e => els.event.add(new Option(e.name, e.id)));
    loadStoredHashes();
  } catch (e) {
    showErr('Verbindung zur Datenbank fehlgeschlagen. Bitte Seite neu laden.');
    console.error(e);
  }
}

async function loadStoredHashes() {
  try {
    const { data } = await supabase.from('einreichungen').select('foto_hashes');
    const s = new Set();
    (data || []).forEach(e => (e.foto_hashes || []).forEach(h => s.add(h)));
    storedHashes = s;
  } catch { storedHashes = new Set(); }
}

// --- Datei-Auswahl ---
els.dz.addEventListener('click', () => els.file.click());
els.file.addEventListener('change', e => addFiles([...e.target.files]));
['dragover', 'dragenter'].forEach(ev => els.dz.addEventListener(ev, e => { e.preventDefault(); els.dz.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => els.dz.addEventListener(ev, e => { e.preventDefault(); els.dz.classList.remove('drag'); }));
els.dz.addEventListener('drop', e => addFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))));

async function addFiles(files) {
  clearMsg();
  if (!files.length) return;
  els.dz.style.pointerEvents = 'none';
  const localHashes = new Set(pending.map(p => p.hash));
  let dups = 0;
  for (const f of files) {
    const [{ dataUrl }, exif] = await Promise.all([compressToDataUrl(f), getExifData(f)]);
    if (!dataUrl) continue;
    const hash = simpleHash(dataUrl);
    if (storedHashes.has(hash) || localHashes.has(hash)) { dups++; continue; }
    localHashes.add(hash);
    pending.push({ dataUrl, previewUrl: dataUrl, gps: exif.gps || null, timestamp: exif.timestamp || null, hash, name: f.name });
  }
  els.dz.style.pointerEvents = '';
  if (dups) showErr(`⚠ ${dups} Foto${dups !== 1 ? 's wurden' : ' wurde'} bereits eingereicht und übersprungen.`);
  renderThumbs();
}

function renderThumbs() {
  els.thumbs.innerHTML = pending.map((p, i) => `
    <div class="thumb">
      <img src="${p.previewUrl}" alt="">
      <button class="thumb__x" data-i="${i}" title="Entfernen">✕</button>
      ${!p.gps ? '<span class="thumb__flag">kein GPS</span>' : ''}
    </div>`).join('');
  els.thumbs.querySelectorAll('.thumb__x').forEach(b =>
    b.addEventListener('click', () => { pending.splice(+b.dataset.i, 1); renderThumbs(); }));
  const n = pending.length;
  els.count.textContent = n ? `${n} Foto${n !== 1 ? 's' : ''} ausgewählt` : '';
}

// --- Absenden ---
els.submit.addEventListener('click', submit);

async function submit() {
  clearMsg();
  const name = els.ma.value;
  const eventId = parseInt(els.event.value, 10);
  if (!name) return showErr('❌ Bitte Mitarbeiter wählen.');
  if (!eventId) return showErr('❌ Bitte Veranstaltung wählen.');
  if (!pending.length) return showErr('❌ Bitte mindestens ein Foto hochladen.');

  const ev = events.find(e => e.id === eventId);
  const warnings = detectWarnings(pending);
  const zeit = new Date().toLocaleString('de-DE');

  els.submit.disabled = true;
  els.progress.classList.remove('hidden');
  let saved = 0;

  for (let b = 0; b < pending.length; b += CHUNK) {
    const batch = pending.slice(b, b + CHUNK);
    const row = {
      mitarbeiter: name, event_id: eventId, event_name: ev.name,
      anzahl: batch.length,
      fotos: batch.map(p => p.dataUrl),
      foto_hashes: batch.map(p => p.hash || ''),
      foto_meta: batch.map(p => ({ gps: p.gps || null, timestamp: p.timestamp || null })),
      warnings: b === 0 ? warnings : [],
      zeit,
    };
    const { error } = await supabase.from('einreichungen').insert(row);
    if (!error) saved += batch.length;
    else console.error('Batch-Fehler:', error);
    els.bar.style.width = Math.round(Math.min(b + CHUNK, pending.length) / pending.length * 100) + '%';
  }

  els.submit.disabled = false;
  els.progress.classList.add('hidden');
  els.bar.style.width = '0%';

  if (!saved) return showErr('❌ Fehler beim Speichern. Bitte erneut versuchen.');

  els.ok.innerHTML = `✅ Erfolgreich eingereicht!<br><strong>${escapeHtml(name)}</strong> · ${escapeHtml(ev.name)} · ${saved} Foto${saved !== 1 ? 's' : ''}`;
  els.ok.classList.remove('hidden');
  pending = []; renderThumbs();
  els.ma.value = ''; els.event.value = '';
  (pending.forEach(p => p.hash && storedHashes.add(p.hash)));
  loadStoredHashes();
}

init();
