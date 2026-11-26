import { supabase, $, $$, toast, escapeHtml } from './config.js';

const META = 'id,mitarbeiter,event_id,event_name,anzahl,foto_meta,foto_hashes,warnings,zeit,created_at';
let events = [], mitarbeiter = [], firmen = [], zahlungen = [], einr = [];
let map, mapLayer;

// Farbpalette: je Event eine eigene Farbe
const EVENT_COLORS = ['#3257e8','#e8730a','#1f9d57','#d8442f','#8b43e8','#0aa5c7',
  '#c7a00a','#d6337d','#2a9d8f','#7048e8','#e85d04','#4a7c17','#b5179e','#007f5f','#9c6644','#ef476f'];

// Datum aus EXIF-Zeitstempel ("YYYY:MM:DD HH:MM:SS") hübsch, sonst Fallback (zeit)
function fmtDate(ts, fallback) {
  if (ts) {
    const m = String(ts).match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}`;
  }
  return fallback || '';
}

/* ---------- AUTH ---------- */
const loginView = $('#login-view'), adminView = $('#admin-view');
const loginErr = $('#login-err'), loginInfo = $('#login-info');

function setLoggedIn(on) {
  loginView.classList.toggle('hidden', on);
  adminView.classList.toggle('hidden', !on);
  $('#logout-btn').classList.toggle('hidden', !on);
}
function authMsg(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function authClear() { loginErr.classList.add('hidden'); loginInfo.classList.add('hidden'); }

$('#login-btn').addEventListener('click', async () => {
  authClear();
  const email = $('#login-email').value.trim(), password = $('#login-pw').value;
  if (!email || !password) return authMsg(loginErr, 'Bitte E-Mail und Passwort eingeben.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    authMsg(loginErr, error.message.includes('Email not confirmed')
      ? 'E-Mail noch nicht bestätigt. Bitte den Link in der Bestätigungs-Mail klicken.'
      : 'Anmeldung fehlgeschlagen: ' + error.message);
  }
});

$('#signup-btn').addEventListener('click', async () => {
  authClear();
  const email = $('#login-email').value.trim(), password = $('#login-pw').value;
  if (!email || password.length < 6) return authMsg(loginErr, 'Für ein neues Konto: E-Mail + Passwort (mind. 6 Zeichen).');
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.href } });
  if (error) return authMsg(loginErr, 'Konto anlegen fehlgeschlagen: ' + error.message);
  authMsg(loginInfo, '✅ Konto angelegt. Bitte den Bestätigungslink in deiner E-Mail klicken, dann anmelden.');
});

$('#resend-btn').addEventListener('click', async () => {
  authClear();
  const email = $('#login-email').value.trim();
  if (!email) return authMsg(loginErr, 'Bitte zuerst deine E-Mail eingeben.');
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  authMsg(error ? loginErr : loginInfo, error ? ('Fehler: ' + error.message) : '✉️ Bestätigungs-Mail erneut gesendet.');
});

$('#logout-btn').addEventListener('click', async () => { await supabase.auth.signOut(); });

supabase.auth.onAuthStateChange((_e, session) => {
  if (session) { setLoggedIn(true); loadAll(); }
  else setLoggedIn(false);
});
supabase.auth.getSession().then(({ data }) => {
  if (data.session) { setLoggedIn(true); loadAll(); } else setLoggedIn(false);
});

/* ---------- TABS ---------- */
$$('#tabs button').forEach(b => b.addEventListener('click', () => {
  $$('#tabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  const tab = b.dataset.tab;
  $$('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== tab));
  if (tab === 'karte') setTimeout(renderMap, 50);
}));

/* ---------- LADEN ---------- */
async function loadAll() {
  try {
    const [ev, ma, fi, za, ei] = await Promise.all([
      supabase.from('events').select('*').order('created_at', { ascending: false }),
      supabase.from('mitarbeiter').select('*').order('name'),
      supabase.from('firmen').select('*').order('name'),
      supabase.from('zahlungen').select('*').order('created_at', { ascending: false }),
      supabase.from('einreichungen').select(META).order('created_at', { ascending: false }),
    ]);
    events = ev.data || []; mitarbeiter = ma.data || []; firmen = fi.data || [];
    zahlungen = za.data || []; einr = ei.data || [];
    renderAll();
  } catch (e) { toast('Laden fehlgeschlagen', 'error'); console.error(e); }
}

function renderAll() {
  renderStats(); renderEinr(); renderEvents(); renderMa(); renderZa(); renderFirmen();
  fillSelect('#ev-firma', firmen.map(f => [f.id, f.name]), true);
  fillSelect('#za-ma', mitarbeiter.map(m => [m.name, m.name]), true);
}

function fillSelect(sel, pairs, keepFirst) {
  const el = $(sel); const first = keepFirst ? el.options[0] : null;
  el.innerHTML = ''; if (first) el.add(first);
  pairs.forEach(([v, t]) => el.add(new Option(t, v)));
}

/* ---------- EINREICHUNGEN (gruppiert) ---------- */
function groupEinr(list) {
  const map = new Map();
  for (const e of list) {
    const key = `${e.mitarbeiter}|${e.event_name}|${e.zeit}`;
    if (!map.has(key)) map.set(key, { ...e, ids: [e.id], anzahl: e.anzahl || 0, warnings: [...(e.warnings || [])], foto_meta: [...(e.foto_meta || [])] });
    else {
      const g = map.get(key);
      g.ids.push(e.id); g.anzahl += e.anzahl || 0;
      g.warnings.push(...(e.warnings || [])); g.foto_meta.push(...(e.foto_meta || []));
    }
  }
  return [...map.values()];
}

function currentGroups() {
  const q = $('#filter-input').value.trim().toLowerCase();
  let g = groupEinr(einr);
  if (q) g = g.filter(x => (x.mitarbeiter + ' ' + x.event_name).toLowerCase().includes(q));
  return g;
}

function renderStats() {
  const g = groupEinr(einr);
  const plakate = g.reduce((s, x) => s + (x.anzahl || 0), 0);
  const fotos = einr.reduce((s, x) => s + (x.foto_meta?.length || x.anzahl || 0), 0);
  const warns = g.filter(x => [...new Set(x.warnings)].length).length;
  $('#stats').innerHTML = `
    ${stat(g.length, 'Einreichungen')}
    ${stat(plakate, 'Plakate gesamt')}
    ${stat(fotos, 'Fotos')}
    ${stat(warns, 'mit Warnung')}
    ${stat(events.length, 'Veranstaltungen')}`;
}
const stat = (n, l) => `<div class="stat"><div class="stat__num">${n}</div><div class="stat__label">${l}</div></div>`;

function renderEinr() {
  const g = currentGroups();
  $('#einr-body').innerHTML = g.map(e => {
    const uniq = [...new Set(e.warnings || [])];
    const warn = uniq.length
      ? `<span class="pill pill--warn" data-wfotos='${escapeHtml(JSON.stringify(e.ids))}' data-wtitle="${escapeHtml(e.mitarbeiter + ' · ' + e.event_name)}" data-warn='${escapeHtml(JSON.stringify(uniq))}'>⚠ ${uniq.length} Fotos prüfen</span>`
      : `<span class="pill pill--ok">✓ OK</span>`;
    return `<tr>
      <td>${escapeHtml(e.mitarbeiter)}</td>
      <td><span class="tag">${escapeHtml(e.event_name)}</span></td>
      <td style="font-weight:600">${e.anzahl}</td>
      <td><button class="act-btn" data-fotos='${escapeHtml(JSON.stringify(e.ids))}' data-title="${escapeHtml(e.mitarbeiter + ' · ' + e.event_name)}">📷 ansehen</button></td>
      <td>${warn}</td>
      <td class="muted">${escapeHtml(e.zeit || '')}</td>
      <td><button class="act-btn" data-del='${escapeHtml(JSON.stringify(e.ids))}'>🗑</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="center muted">Keine Einreichungen</td></tr>`;

  $$('#einr-body .pill--warn').forEach(p => p.addEventListener('click', () => openFotos(JSON.parse(p.dataset.wfotos), p.dataset.wtitle, JSON.parse(p.dataset.warn))));
  $$('#einr-body [data-fotos]').forEach(b => b.addEventListener('click', () => openFotos(JSON.parse(b.dataset.fotos), b.dataset.title)));
  $$('#einr-body [data-del]').forEach(b => b.addEventListener('click', () => delEinr(JSON.parse(b.dataset.del))));
}

function showWarnings(list) {
  openModal('#modal-edit');
  $('#edit-title').textContent = 'Warnungen';
  $('#edit-body').innerHTML = `<ul style="margin:0;padding-left:18px;line-height:1.9">${list.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
}

async function openFotos(ids, title, warnings = []) {
  openModal('#modal-fotos');
  $('#fotos-title').textContent = title || 'Fotos';
  const gal = $('#fotos-gallery');
  const warnHtml = (warnings && warnings.length)
    ? `<div class="msg msg--info" style="grid-column:1/-1;margin:0 0 4px">⚠ ${warnings.map(escapeHtml).join(' · ')}</div>`
    : '';
  gal.innerHTML = warnHtml + '<p class="muted" style="grid-column:1/-1">Lade Fotos …</p>';
  const { data } = await supabase.from('einreichungen').select('fotos,foto_meta').in('id', ids);
  const imgs = [];
  (data || []).forEach(r => (r.fotos || []).forEach((src, i) => imgs.push({ src, gps: r.foto_meta?.[i]?.gps })));
  gal.innerHTML = warnHtml + (imgs.length ? imgs.map(im => {
    const link = im.gps ? `https://maps.google.com/?q=${im.gps.lat},${im.gps.lon}` : null;
    const img = `<img loading="lazy" src="${im.src}" alt="">`;
    return link ? `<a href="${link}" target="_blank" rel="noopener" title="Auf Karte zeigen">${img}</a>` : `<a>${img}</a>`;
  }).join('') : '<p class="muted" style="grid-column:1/-1">Keine Fotos.</p>');
}

async function delEinr(ids) {
  if (!confirm(`Diese Einreichung (${ids.length} Datensatz/-sätze) wirklich löschen?`)) return;
  const { error } = await supabase.from('einreichungen').delete().in('id', ids);
  if (error) return toast('Löschen fehlgeschlagen', 'error');
  toast('Gelöscht', 'success'); loadAll();
}

/* ---------- EVENTS ---------- */
$('#ev-add').addEventListener('click', async () => {
  const name = $('#ev-name').value.trim();
  if (!name) return toast('Name fehlt', 'error');
  const row = { name, bestand: parseInt($('#ev-bestand').value || '0', 10), status: 'aktiv' };
  const fid = $('#ev-firma').value; if (fid) row.firma_id = parseInt(fid, 10);
  const { error } = await supabase.from('events').insert(row);
  if (error) return toast('Fehler', 'error');
  $('#ev-name').value = ''; $('#ev-bestand').value = '0'; toast('Angelegt', 'success'); loadAll();
});

function renderEvents() {
  const used = {}; groupEinr(einr).forEach(g => { used[g.event_name] = (used[g.event_name] || 0) + g.anzahl; });
  $('#events-body').innerHTML = events.map(e => {
    const firma = firmen.find(f => f.id === e.firma_id);
    return `<tr>
      <td>${escapeHtml(e.name)}</td>
      <td>${e.bestand ?? 0}</td>
      <td>${used[e.name] || 0}</td>
      <td><span class="pill ${e.status === 'aktiv' ? 'pill--ok' : 'pill--warn'}">${escapeHtml(e.status || 'aktiv')}</span></td>
      <td class="muted">${firma ? escapeHtml(firma.name) : '—'}</td>
      <td class="flex">
        <button class="act-btn" data-ev-edit="${e.id}">✎</button>
        <button class="act-btn" data-ev-del="${e.id}">🗑</button>
      </td></tr>`;
  }).join('') || `<tr><td colspan="6" class="center muted">Keine Veranstaltungen</td></tr>`;

  $$('[data-ev-del]').forEach(b => b.addEventListener('click', () => delEvent(+b.dataset.evDel)));
  $$('[data-ev-edit]').forEach(b => b.addEventListener('click', () => editEvent(+b.dataset.evEdit)));
}

function editEvent(id) {
  const e = events.find(x => x.id === id); if (!e) return;
  openModal('#modal-edit'); $('#edit-title').textContent = 'Veranstaltung bearbeiten';
  $('#edit-body').innerHTML = `
    <label class="field"><span class="field__label">Name</span><input type="text" id="e-name" value="${escapeHtml(e.name)}"></label>
    <label class="field"><span class="field__label">Bestand</span><input type="number" id="e-bestand" value="${e.bestand ?? 0}"></label>
    <label class="field"><span class="field__label">Status</span><select id="e-status">
      <option ${e.status === 'aktiv' ? 'selected' : ''}>aktiv</option>
      <option ${e.status === 'beendet' ? 'selected' : ''}>beendet</option></select></label>
    <button class="btn btn--primary btn--block" id="e-save">Speichern</button>`;
  $('#e-save').addEventListener('click', async () => {
    const { error } = await supabase.from('events').update({
      name: $('#e-name').value.trim(), bestand: parseInt($('#e-bestand').value || '0', 10), status: $('#e-status').value
    }).eq('id', id);
    if (error) return toast('Fehler', 'error');
    closeModal('#modal-edit'); toast('Gespeichert', 'success'); loadAll();
  });
}

async function delEvent(id) {
  const e = events.find(x => x.id === id);
  if (!confirm(`Veranstaltung "${e?.name}" löschen? Zugehörige Einreichungen werden ebenfalls gelöscht.`)) return;
  await supabase.from('einreichungen').delete().eq('event_id', id);
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) return toast('Fehler', 'error');
  toast('Gelöscht', 'success'); loadAll();
}

/* ---------- MITARBEITER ---------- */
$('#ma-add').addEventListener('click', async () => {
  const name = $('#ma-name').value.trim(); if (!name) return toast('Name fehlt', 'error');
  const { error } = await supabase.from('mitarbeiter').insert({ name });
  if (error) return toast('Fehler', 'error');
  $('#ma-name').value = ''; toast('Angelegt', 'success'); loadAll();
});

function renderMa() {
  const g = groupEinr(einr);
  $('#ma-body').innerHTML = mitarbeiter.map(m => {
    const mine = g.filter(x => x.mitarbeiter === m.name);
    const plakate = mine.reduce((s, x) => s + x.anzahl, 0);
    return `<tr><td>${escapeHtml(m.name)}</td><td>${mine.length}</td><td>${plakate}</td>
      <td><button class="act-btn" data-ma-del="${m.id}">🗑</button></td></tr>`;
  }).join('') || `<tr><td colspan="4" class="center muted">Keine Mitarbeiter</td></tr>`;
  $$('[data-ma-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Mitarbeiter löschen?')) return;
    await supabase.from('mitarbeiter').delete().eq('id', +b.dataset.maDel);
    toast('Gelöscht', 'success'); loadAll();
  }));
}

/* ---------- ZAHLUNGEN ---------- */
$('#za-add').addEventListener('click', async () => {
  const mitarbeiter_ = $('#za-ma').value, betrag = parseFloat($('#za-betrag').value);
  if (!mitarbeiter_ || isNaN(betrag)) return toast('Mitarbeiter und Betrag nötig', 'error');
  const { error } = await supabase.from('zahlungen').insert({
    mitarbeiter: mitarbeiter_, betrag, notiz: $('#za-notiz').value.trim(), datum: new Date().toLocaleString('de-DE')
  });
  if (error) return toast('Fehler', 'error');
  $('#za-betrag').value = ''; $('#za-notiz').value = ''; toast('Gespeichert', 'success'); loadAll();
});

function renderZa() {
  $('#za-body').innerHTML = zahlungen.map(z => `<tr>
    <td>${escapeHtml(z.mitarbeiter)}</td><td>${Number(z.betrag).toFixed(2)} €</td>
    <td class="muted">${escapeHtml(z.notiz || '')}</td><td class="muted">${escapeHtml(z.datum || '')}</td>
    <td><button class="act-btn" data-za-del="${z.id}">🗑</button></td></tr>`).join('')
    || `<tr><td colspan="5" class="center muted">Keine Zahlungen</td></tr>`;
  $$('[data-za-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Zahlung löschen?')) return;
    await supabase.from('zahlungen').delete().eq('id', +b.dataset.zaDel);
    toast('Gelöscht', 'success'); loadAll();
  }));
}

/* ---------- FIRMEN ---------- */
$('#fi-add').addEventListener('click', async () => {
  const name = $('#fi-name').value.trim(); if (!name) return toast('Name fehlt', 'error');
  const { error } = await supabase.from('firmen').insert({
    name, email: $('#fi-email').value.trim(), adresse: $('#fi-adresse').value.trim()
  });
  if (error) return toast('Fehler', 'error');
  $('#fi-name').value = ''; $('#fi-email').value = ''; $('#fi-adresse').value = '';
  toast('Angelegt', 'success'); loadAll();
});

function renderFirmen() {
  $('#fi-body').innerHTML = firmen.map(f => `<tr>
    <td>${escapeHtml(f.name)}</td><td class="muted">${escapeHtml(f.email || '')}</td>
    <td class="muted">${escapeHtml((f.adresse || '').replace(/\n/g, ', '))}</td>
    <td class="flex">
      <button class="act-btn" data-fi-pdf="${f.id}">🧾 Rechnung</button>
      <button class="act-btn" data-fi-del="${f.id}">🗑</button>
    </td></tr>`).join('') || `<tr><td colspan="4" class="center muted">Keine Firmen</td></tr>`;
  $$('[data-fi-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Firma löschen?')) return;
    await supabase.from('firmen').delete().eq('id', +b.dataset.fiDel);
    toast('Gelöscht', 'success'); loadAll();
  }));
  $$('[data-fi-pdf]').forEach(b => b.addEventListener('click', () => invoice(+b.dataset.fiPdf)));
}

function invoice(firmaId) {
  const f = firmen.find(x => x.id === firmaId); if (!f) return;
  const evs = events.filter(e => e.firma_id === firmaId);
  const used = {}; groupEinr(einr).forEach(g => (used[g.event_name] = (used[g.event_name] || 0) + g.anzahl));
  const { jsPDF } = window.jspdf; const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(18); doc.text('Rechnung – PlakatTrack', 20, y); y += 12;
  doc.setFontSize(11);
  doc.text(f.name, 20, y); y += 6;
  (f.adresse || '').split('\n').forEach(l => { doc.text(l, 20, y); y += 6; });
  if (f.email) { doc.text(f.email, 20, y); y += 6; }
  y += 6; doc.text('Datum: ' + new Date().toLocaleDateString('de-DE'), 20, y); y += 12;
  doc.setFont(undefined, 'bold'); doc.text('Veranstaltung', 20, y); doc.text('Plakate', 150, y); y += 7;
  doc.setFont(undefined, 'normal'); let total = 0;
  if (!evs.length) { doc.text('Keine Veranstaltungen dieser Firma zugeordnet.', 20, y); y += 7; }
  evs.forEach(e => { const n = used[e.name] || 0; total += n; doc.text(String(e.name), 20, y); doc.text(String(n), 150, y); y += 7; });
  y += 4; doc.setFont(undefined, 'bold'); doc.text('Summe Plakate', 20, y); doc.text(String(total), 150, y);
  doc.save(`Rechnung_${f.name.replace(/\s+/g, '_')}.pdf`);
}

/* ---------- KARTE ---------- */
function renderMap() {
  // Nur aktive (nicht beendete) Veranstaltungen beruecksichtigen
  const activeNames = new Set(events.filter(e => (e.status ?? 'aktiv') !== 'beendet').map(e => e.name));

  // Feste Farben je Mitarbeiter (weitere bekommen automatisch eine aus der Palette)
  const MA_COLORS = { 'Jerry': '#3257e8', 'Nenad': '#d8442f', 'Joschi': '#1f9d57' };
  let palIdx = 0;
  const colorOf = (name) => MA_COLORS[name] || (MA_COLORS[name] = EVENT_COLORS[palIdx++ % EVENT_COLORS.length]);

  // GPS-Punkte je Mitarbeiter (nur aus aktiven Events)
  const byMa = {};
  einr.forEach(e => {
    if (!activeNames.has(e.event_name)) return;
    (e.foto_meta || []).forEach(m => {
      if (m?.gps?.lat != null) (byMa[e.mitarbeiter] ??= []).push({ lat: m.gps.lat, lon: m.gps.lon, ev: e.event_name, date: fmtDate(m.timestamp, e.zeit) });
    });
  });

  const totalPts = Object.values(byMa).reduce((s, a) => s + a.length, 0);
  $('#map-count').textContent = `${totalPts} Fotos · ${Object.keys(byMa).length} Mitarbeiter`;

  if (!map) {
    map = L.map('map').setView([51.96, 7.63], 11); // Münster
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  }
  if (mapLayer) mapLayer.remove();
  mapLayer = L.layerGroup().addTo(map);

  const bounds = [];
  Object.entries(byMa).forEach(([ma, pts]) => {
    const col = colorOf(ma);
    pts.forEach(p => {
      L.circleMarker([p.lat, p.lon], { radius: 6, color: col, fillColor: col, fillOpacity: .75, weight: 1 })
        .bindPopup(`<b>${escapeHtml(ma)}</b><br>${escapeHtml(p.ev)}<br><span style="color:#888">📅 ${escapeHtml(p.date || '—')}</span>`).addTo(mapLayer);
      bounds.push([p.lat, p.lon]);
    });
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });

  // Legende mit Zählung je Mitarbeiter (meiste zuerst)
  const legend = Object.entries(byMa)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([ma, pts]) => `<span class="pill" style="background:var(--surface-2)">
      <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${colorOf(ma)}"></span>
      ${escapeHtml(ma)}: <b>${pts.length}</b></span>`).join(' ');
  const host = $('#map-legend');
  if (host) host.innerHTML = legend || '<span class="muted">Keine aktiven Veranstaltungen mit GPS-Fotos.</span>';

  setTimeout(() => map.invalidateSize(), 60);
}

/* ---------- EXPORT ---------- */
$('#export-btn').addEventListener('click', () => {
  const rows = [['Mitarbeiter', 'Veranstaltung', 'Plakate', 'Warnungen', 'Zeit']];
  currentGroups().forEach(g => rows.push([g.mitarbeiter, g.event_name, g.anzahl, [...new Set(g.warnings)].join('; '), g.zeit]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Einreichungen');
  XLSX.writeFile(wb, 'plakattrack_einreichungen.xlsx');
});

$('#reload-btn').addEventListener('click', loadAll);
$('#filter-input').addEventListener('input', renderEinr);

/* ---------- MODALS ---------- */
function openModal(sel) { $(sel).classList.add('open'); }
function closeModal(sel) { $(sel).classList.remove('open'); }
$$('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov || e.target.hasAttribute('data-close')) ov.classList.remove('open'); });
});
