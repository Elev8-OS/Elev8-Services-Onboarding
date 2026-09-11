# Elev8 Services Onboarding

Aufnahme-Formular für Tenants, deren Gästekommunikation ein Elev8-Guest-Relations-Officer
übernimmt. Alles, was in Elev8 schon steht, wird über den Elev8-MCP gelesen und
vorausgefüllt — der Tenant bestätigt statt zu tippen. Gefragt wird nur, was in keinem
System steht: Entscheidungsmandat, Eskalationskette, Partner vor Ort, Auftreten,
Meldewesen und Zugänge.

## Ablauf

1. **Tenant anlegen** (`/admin/tenants`) — Name plus Elev8-Bearer-Token. Die App
   verbindet sich sofort mit dem MCP und liest die Stammdaten.
2. **Aufnahme anlegen** (`/admin`) — Tenant aus der Liste auswählen, nicht eintippen.
   Beim Anlegen werden die Elev8-Daten frisch geholt und als Snapshot an der Aufnahme
   festgehalten.
3. **Link verschicken** — der Tenant öffnet `/f/:token`, bestätigt die vorausgefüllten
   Angaben (einzeln, abschnittsweise oder alle auf einmal) und beantwortet den Rest.
4. **Mitlesen und exportieren** (`/admin/i/:id`) — als Markdown oder JSON.

## Was aus Elev8 kommt

Gelesen wird `get_listings_overview` und, wenn verfügbar, `get_revenue_by_channel`.
Daraus entstehen:

| Feld im Formular | Quelle |
|---|---|
| Firmenname | Tenant-Name |
| Adresse | häufigste Listing-Adresse, plus Hinweis auf weitere |
| Anzahl Einheiten | Anzahl aktiver Listings |
| Kanäle | Umsatzanteil je Kanal im Vormonat |
| Zugang zum Objekt | Lock-Typ je Einheit, plus Anzahl hinterlegter Check-in-Schritte |
| Smart Lock | Anzahl verbundener Smart Locks |
| WLAN | SSID, oder Anzahl Einheiten mit hinterlegtem WLAN |
| Kaution | hinterlegte Beträge und Anzahl Einheiten |
| Zusatzleistungen | Anzahl Einheiten mit zugewiesenen Upsells |
| KI-Antworten | ob die AI in Elev8 bereits aktiv ist |

Zusätzlich zeigt das Formular eine Bereitschaftsanzeige: wie viele Einheiten
Check-in-/Check-out-Schritte, WLAN, Good to Know, Reinigungs-Setup, Upsells und ein
hinterlegtes Schloss haben. Das ist reine Information — und gleichzeitig die
Datenqualitäts-Prüfung vor dem Go-live.

Antworten tragen eine Herkunft: `confirmed` (aus Elev8, vom Tenant bestätigt) oder
`tenant` (selbst getippt oder korrigiert).

## Aufbau

- `src/questions.js` — der Fragenkatalog. Neue Fragen hier ergänzen, sonst nichts ändern.
- `src/elev8.js` — MCP-Client, Ableitung der Fakten, Vorbelegung, Bereitschaftsanzeige.
- `src/server.js` — Express-Routen.
- `src/db.js` — Postgres-Schema und Abfragen; die Tabellen werden beim Start angelegt.
- `src/render.js` — serverseitige HTML-Templates.
- `public/` — Stylesheet und Client-Skripte.

## Routen

| Route | Zweck |
|---|---|
| `/admin` | Aufnahmen, Tenant auswählen und Aufnahme anlegen |
| `/admin/tenants` | Tenants anlegen, Token hinterlegen, Daten holen |
| `/admin/tenants/:id` | was aus Elev8 gelesen wurde und womit vorausgefüllt wird |
| `/admin/tenants/:id/diagnose` | Verbindungstest — zeigt die verfügbaren MCP-Tools |
| `/admin/i/:id` | Antworten lesen, Export als Markdown oder JSON |
| `/f/:token` | Formular für den Tenant |
| `/healthz` | Health Check für Railway |

## Variablen

| Name | Pflicht | Zweck |
|---|---|---|
| `DATABASE_URL` | ja | Postgres, auf Railway per Referenz auf den Postgres-Service |
| `ADMIN_PASSWORD` | ja | Passwort für den internen Bereich |
| `SESSION_SECRET` | empfohlen | signiert das Admin-Cookie |
| `ELEV8_MCP_URL` | nein | Standard `https://mcp.elev8-suite.com/sse` |
| `ELEV8_TIMEOUT_MS` | nein | Standard 25000 |
| `ELEV8_ADMIN_TOKEN` | nein | Token für die tenantübergreifende Liste |
| `ELEV8_TENANTS_TOOL` | nein | Name des MCP-Tools, das alle Tenants auflistet |
| `PORT` | nein | setzt Railway selbst |

Sind `ELEV8_ADMIN_TOKEN` und `ELEV8_TENANTS_TOOL` gesetzt, erscheint unter
`/admin/tenants/discover` die Liste aller Tenants direkt aus Elev8. Solange der
Endpoint nicht feststeht, wird ein Tenant einmal von Hand angelegt und danach nur
noch ausgewählt.

## Deployment

Railway baut dieses Repo direkt aus dem Wurzelverzeichnis (Nixpacks, `npm start`,
Health Check auf `/healthz`). Postgres hängt als eigener Service daran;
`DATABASE_URL` verweist per Referenz darauf.

## Lokal starten

```bash
npm install
DATABASE_URL=postgres://… ADMIN_PASSWORD=test npm start
```
