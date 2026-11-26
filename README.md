# PlakatTrack

Moderne Neuauflage der Foto-Einreichungs- und Verwaltungs-App für Plakataktionen.
Statische Web-App (läuft auf GitHub Pages), Datenhaltung über Supabase.

**Live:** https://emmosk2607.github.io/plakattrack/

## Funktionen

**Öffentlich (`index.html`)**
- Mitarbeiter und Veranstaltung wählen
- Fotos per Klick oder Drag-and-drop hochladen
- Automatische Auswertung je Foto: Aufnahmezeit und GPS (aus EXIF)
- Dubletten-Erkennung (bereits eingereichte Fotos werden übersprungen)
- Automatische Warnungen (kein GPS, gleicher Standort, zu schnell, zu alt)

**Admin (`admin.html`)**
- **Echter Login über Supabase Auth** (kein Passwort im Code)
- Einreichungen mit Statistik, Suche, Fotogalerie und **klickbaren Warnungen**
- Verwaltung: Veranstaltungen, Mitarbeiter, Zahlungen, Firmen
- **Karte** aller Fotostandorte (OpenStreetMap/Leaflet)
- Excel-Export und PDF-Rechnung je Firma

## Projektstruktur

```
index.html            Öffentliche Upload-Seite
admin.html            Admin-Bereich
assets/css/style.css  Design-System (hell/dunkel, responsiv)
assets/js/config.js   Supabase-Client + Helfer
assets/js/exif.js     EXIF/GPS, Dubletten-Hash, Warnungen
assets/js/public.js   Logik der Upload-Seite
assets/js/admin.js    Logik des Admin-Bereichs
SUPABASE-SICHERHEIT.md  WICHTIG: Datenbank absichern (RLS)
```

## Technik
- Reines HTML/CSS/JavaScript (ES-Module), kein Build-Schritt nötig
- [@supabase/supabase-js](https://supabase.com/docs) für Datenbank + Login
- Leaflet (Karte), SheetJS (Excel), jsPDF (Rechnungen) via CDN

## Sicherheit
Der `anon`-Key im Code ist für Supabase-Web-Apps vorgesehen und darf öffentlich
sein. Der eigentliche Schutz kommt aus **Row Level Security** – Einrichtung siehe
[SUPABASE-SICHERHEIT.md](SUPABASE-SICHERHEIT.md). **Bis dieser Schritt gemacht ist,
ist die Datenbank offen.**
