// Zentrale Konfiguration und Supabase-Client
// Hinweis: Der anon-Key ist fuer oeffentliche Supabase-Web-Apps vorgesehen und
// darf im Quelltext stehen. Der eigentliche Schutz kommt aus Row Level Security
// (siehe SUPABASE-SICHERHEIT.md). Es gehoeren KEINE echten Passwoerter oder
// service_role-Schluessel in diesen Code.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const SB_URL = 'https://gzemnupesqqjbshakzkb.supabase.co';
export const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6ZW1udXBlc3FxamJzaGFremtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDc5MzUsImV4cCI6MjA5NDAyMzkzNX0.NchnuzBZapvVMVUsVzDDgLhyxrIR27mYrrKitaut09A';

export const supabase = createClient(SB_URL, ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'plakattrack-auth' }
});

// Maximale Anzahl Fotos pro Datenbank-Eintrag (wie in der Alt-Version)
export const CHUNK = 20;

// Kleine Helfer fuer DOM-Zugriff
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, type = 'info', ms = 3500) {
  let host = $('#toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
