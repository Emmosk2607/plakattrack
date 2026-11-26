# Supabase absichern – Anleitung (einmalig)

Dieser Schritt ist **entscheidend**. Solange er nicht gemacht ist, kann jeder im
Internet die Datenbank lesen und ändern – egal wie gut der Code ist. Der Schutz
entsteht **nur** durch Row Level Security (RLS) in Supabase.

## 1. Ins Supabase-Dashboard einloggen

1. Gehe auf **https://supabase.com** → **Sign in**.
2. Wähle die Anmeldeart, mit der das Projekt erstellt wurde – sehr wahrscheinlich
   **„Continue with GitHub"** mit deinem **kokapalme**-GitHub-Konto.
3. Öffne das Projekt **gzemnupesqqjbshakzkb**.

Falls du nicht hineinkommst: probiere auch „Continue with Google". Das Projekt
gehört dem Konto, mit dem es ursprünglich angelegt wurde.

## 2. Admin-Konto für die App anlegen

Der neue Admin-Login nutzt echte Anmeldung (Supabase Auth). Du kannst dein
Admin-Konto direkt in der App anlegen:

1. Öffne die Seite **…/admin.html**.
2. E-Mail + Passwort eingeben → **„Konto anlegen"**.
3. Bestätigungs-Mail öffnen und den Link klicken.
4. Danach in der App **anmelden**.

## 3. RLS einschalten + Regeln setzen (SQL)

Im Dashboard links **SQL Editor** → **New query** → folgendes einfügen und **Run**:

```sql
-- 1) RLS fuer alle Tabellen aktivieren
alter table public.einreichungen enable row level security;
alter table public.events        enable row level security;
alter table public.mitarbeiter   enable row level security;
alter table public.zahlungen     enable row level security;
alter table public.firmen        enable row level security;

-- 2) Oeffentlich (nicht angemeldet): nur das Noetigste
--    a) neue Einreichungen anlegen duerfen
create policy "public_insert_einreichungen" on public.einreichungen
  for insert to anon with check (true);
--    b) aktive Listen fuer die Auswahl lesen duerfen
create policy "public_read_events" on public.events
  for select to anon using (true);
create policy "public_read_mitarbeiter" on public.mitarbeiter
  for select to anon using (true);

-- 3) Angemeldete Admins: voller Zugriff
create policy "admin_all_einreichungen" on public.einreichungen
  for all to authenticated using (true) with check (true);
create policy "admin_all_events" on public.events
  for all to authenticated using (true) with check (true);
create policy "admin_all_mitarbeiter" on public.mitarbeiter
  for all to authenticated using (true) with check (true);
create policy "admin_all_zahlungen" on public.zahlungen
  for all to authenticated using (true) with check (true);
create policy "admin_all_firmen" on public.firmen
  for all to authenticated using (true) with check (true);
```

Ergebnis danach:
- **Firmen und Zahlungen**: für Fremde komplett gesperrt (kein Lesen, kein Ändern).
- **Einreichungen**: Fremde können nur noch **neue einreichen**, aber **nichts
  lesen, ändern oder löschen**.
- **Events/Mitarbeiter**: öffentlich nur lesbar (für die Auswahllisten), Änderungen
  nur für angemeldete Admins.
- **Angemeldete Admins**: voller Zugriff wie gewohnt.

## 4. Offene Registrierung schließen (wichtig!)

Weil aktuell jeder ein Konto anlegen kann, und jedes angemeldete Konto Admin-Rechte
bekäme: **nach** dem Anlegen deines eigenen Admin-Kontos die Registrierung abschalten.

Dashboard → **Authentication** → **Providers/Sign In** → **„Allow new users to sign up"**
**ausschalten**.

## 5. (Optional) Storage-Bucket „Fotos" absichern

Die neue App speichert Fotos direkt in der Tabelle (nicht im Bucket). Falls der
Bucket „Fotos" dennoch existiert und öffentlich ist, im Dashboard unter
**Storage → Fotos → Configuration** auf **privat** stellen.

## 6. Prüfen

Nach den Schritten sollte dieser Test **nichts** mehr liefern (leer oder Fehler),
wenn man ihn ohne Anmeldung in der Browser-Konsole ausführt:

```js
fetch("https://gzemnupesqqjbshakzkb.supabase.co/rest/v1/firmen?select=*",
  {headers:{apikey:SB_ANON,Authorization:"Bearer "+SB_ANON}})
  .then(r=>r.json()).then(console.log)
```

Vorher kam die komplette Firmenliste – nachher darf dort nichts mehr erscheinen.
