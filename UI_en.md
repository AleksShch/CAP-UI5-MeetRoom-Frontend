# RsvRoom interface

The first version described in [frontend_en.md](frontend_en.md) is implemented. It is a Freestyle UI5 application with a Component, Router, and separate screen modules. It uses OpenUI5 1.152.0, the open SAPUI5 libraries `sap.m`, `sap.ui.core`, and `sap.ui.layout`, and the Horizon theme. UI5 Tooling builds these libraries and serves them locally without a CDN.

## Running

```powershell
docker compose up --build -d
```

Open <http://localhost:4004/> and select a user with the desired role. No password or setup token is required. Use the name button in the top bar to switch profiles. Roles and example profiles are described in [ACCESS_en.md](ACCESS_en.md). The interface supports English and German; the office and language are stored in the browser, while the selected profile is held in a server session. Administration and the floor editor are available only to administrators.

On the display screen, the language selector is at the bottom. Switching it updates labels, dates, standard UI5 dialogs, the browser-tab title, and the document language. A previously stored `ru` value is replaced by `en`.

The software version appears to the right of RsvRoom in the header as a build date and time in `YYYY-MM-DD HH:mm:ss UTC` format. `npm run build:ui` writes a new date to `gen/ui/build-info.json` even when UI5 libraries are already built. Docker builds generate this version automatically. Application startup uses `--ensure` and keeps an existing build date, creating artifacts only when needed. Refresh the page after a new build to see the new version.

### Translations

Static application text is stored as UTF-8 in:

- `app/i18n/i18n.properties` — English fallback dictionary;
- `app/i18n/i18n_en.properties` — English interface;
- `app/i18n/i18n_de.properties` — German interface;
- `_i18n/messages.properties`, `messages_en.properties`, `messages_de.properties` — CAP validation messages.

UI5 loads dictionaries through `ResourceBundle`; the component also exposes a named `i18n` model for XML bindings such as `{i18n>save}`. In controllers, use `this.t('save')`; for text with variables, use `this.t('remainingMinutes', [minutes])`. The dictionary placeholder format is `remainingMinutes=Noch {0} Minuten`. Add every key to all three files in the relevant dictionary; the English fallback must match `i18n_en.properties`.

The server translates errors according to `Accept-Language`. The client sends that header for ordinary requests and each `$batch` operation. In handlers, use a message key such as `req.reject(400, 'CAPACITY_EXCEEDED', 'attendeeCount', [capacity])` rather than JavaScript text. Resource, employee, office, and saved-booking names remain database data.

`npm test` checks key completeness, matching translation parameters, language persistence, and localized API errors. The language-switch browser scenario runs with `npm run test:ui`.

Without Docker:

```powershell
npm ci
npm start
```

Before first startup, the UI5 runtime is built automatically under `gen/ui/resources`. The initial build requires npm access. Later startups reuse the built resources; the browser needs no internet access. `npm run build:ui` checks runtime readiness; `node scripts/build-ui.js --force` rebuilds it. Use `npm run dev` to watch source changes.

## Screens

| Screen | Actions |
| --- | --- |
| Overview | Today's workplace, upcoming meetings, availability counts, and team plans |
| Find a space | Select office, building, floor, date, and time; map or list; resource details and booking |
| Meeting rooms | Capacity and equipment filters; room schedule with a selectable free one-hour interval |
| My bookings | Open a resource; edit title, time, resource, or attendee count; cancel a booking |
| My work week | Plan specific dates as office, home, vacation, or business trip; save a week as one atomic group |
| My team | Plans and booked desks for selected teammates on a selected date |
| Administration | Reference-data CRUD, equipment, teams, displays, SVG plans, and resource coordinates |
| Room/desk display | Current occupancy, organizer, remaining time, and next booking; refreshes every 30 seconds |

In the interface, a “desk” corresponds to the API's `WORKPLACE` resource type. An office corresponds to `Sites`. The model also supports `ROOM`, `PARKING`, `LOCKER`, `CAR`, and `OTHER`.

Plan colors indicate available, occupied, booked by you, disabled, and team-restricted resources. `Resources.restrictedTeam_ID` sets the restriction, which the server checks. A blue marker indicates a teammate's booking.

Without an uploaded plan, the application shows a schematic view rather than actual office geometry. On phones, the list opens by default; the plan can be enabled manually.

## Direct links

UI5 uses hash navigation, for example `/#bookings` and `/#schedule`. Direct entry URLs also work:

```text
/dashboard
/office/{site_UUID}
/floor/{floor_UUID}
/desk/{resource_UUID}
/room/{resource_UUID}
/bookings
/schedule
/team
/admin
/display/room/{resource_UUID}
/display/desk/{resource_UUID}
```

First demo meeting-room display: <http://localhost:4004/display/room/50000000-0000-4000-8000-000000000001>.

## Parking

The **Parking / Parken** section is available to every role at `/parking`. Its hierarchy resembles buildings: **office → parking lot → level or zone → parking space**. An open lot needs only one level, such as Ground / Außenbereich; create more for multilevel parking.

**Add parking lot** and **Add parking level** appear only in **Administration**, in **Parking lots** and **Parking levels / zones**. A level can also be added from its parking-lot row. Create individual spaces under **Parking spaces** in Administration or with **Add parking space** in Parking. Names, codes, active status, and team restrictions are edited like other objects. Existing buildings and workplaces remain in their own lists.

Select a lot, level, date, and time, then choose a space on the plan or in the list and click **Reserve**. The booking belongs to the current user and appears in **My bookings**, where it can be edited or cancelled. A key user may delete another person's booking within their company. Each space holds one car, and overlapping bookings are forbidden. A workplace and parking space may be booked together.

**Open floor editor** opens the selected level's plan: upload a plan, draw an area, and link a **Parking space** resource or use **Set up booking**. Direct links: `/parking-lot/<parking lot ID>` and `/parking-space/<space ID>`. An administrator creates new lots; an update does not invent parking lots in an existing database.

## Floor plan

The **Floor** selector in **Plan editor** shows building floors and parking levels for the office selected in the header. Parking entries have the **Parking / Parken** prefix. A lot without levels also appears: select it and use **Administration** to open the parking-lot list. Create its first level with **Add parking level** in the lot row, then open its editor from **Parking levels / zones**. **Refresh** reloads the list and asks before discarding unsaved changes. Changing office updates the list and selected plan. `/floor-editor/<parking lot ID>` opens a lot even before its first level exists.

Open **Plan editor** / **Plan bearbeiten** from the left menu. In **Administration → Floors** / **Verwaltung → Etagen**, **Open floor editor** / **Etageneditor öffnen** opens a specific floor. The selected floor appears in the URL as `/#floor-editor/<ID>`; `/floor-editor/<ID>` also works. Example: <http://localhost:4004/floor-editor/40000000-0000-4000-8000-000000000001>.

Upload a JPG/PNG image up to 5 MB. Its original width and height define the canvas; each dimension must be between 100 and 10,000 pixels. Older SVG plans up to 1 MB are also supported.

Click **Draw rectangle** / **Rechteck zeichnen** and drag to make a rounded-corner area. In **Select** / **Auswählen** mode, move an area or resize it using the eight edge handles. The right panel sets its name, type, X/Y, width, height, radius, color, and opacity. Save writes form-field changes; drawing, moving, and resizing are saved when the mouse is released.

Moves and resizes save in the background without a blocking spinner or full data reload. Coordinates update immediately on the plan and in the panel. Repeated edits to one area during a save are combined into the latest position; requests run sequentially. On error, the last confirmed position is restored and a message appears. Switching floors or performing another editor operation waits for a save; closing a tab with a pending request triggers the browser's warning.

`ROOM` and `DESK` areas can link to a meeting room or workplace on the same floor. `ZONE` is independent; `OTHER` supports other resources. One resource links to one area. Duplicating an area clears its resource link so it can be assigned elsewhere. Deleting an area retains its resource and bookings.

Drawing, adding, or copying an area assigns a name automatically: initials of the building and floor names plus the next number. For example, `Hannover Building A · First Floor` → `HBAFF1`, `HBAFF2`; if `HBAFF5` exists, the next is `HBAFF6`. Numbering is independent for each floor and also accounts for older areas with arbitrary names. CAP assigns the name in a transaction, so concurrent additions get different numbers. You can edit the name in the properties panel.

The image and areas zoom together with the wheel or `+`/`−`. **Fit to screen** fits the viewport; **Reset to 100%** shows original pixels. Pan with **Pan**, the middle mouse button, or `Space + drag`. The grid snaps geometry in 10-pixel steps. Arrow keys move the selected area by 1 pixel, or 10 with `Shift`; `Delete` removes it and `Ctrl+D` copies it. Zoom and camera position do not change database coordinates.

The booking map uses the same image and saved areas. Selecting a linked area opens resource details and booking; its color shows availability. Resources without areas currently appear at their old `Resources.mapX/mapY` coordinates or at schematic positions.

In **Find a space** and **Meeting rooms**, you can also select a resource using the **Resource** list above the map. An independent area can be selected by click or Enter and shows **Booking not configured**. In its card or the floor editor, an administrator can click **Set up booking** and link an unassigned same-floor resource or create a new desk/meeting room with name, code, and capacity. Resource creation and area linking are saved in one transaction. The configured area then shows availability and offers **Reserve**. Regular and key users see an explanation for unconfigured areas; only administrators may configure them.

Replacing an image retains absolute coordinates; the server rejects the replacement if existing areas extend beyond the new bounds. Move, shrink, or delete those areas first. **Remove plan** removes only the background, retaining canvas size, areas, resources, and bookings.

## Displays and tokens

Under **Administration → Displays**, create a record, assign a resource, and click **Create display link**. The link carries a device token in the URL fragment. Save it in the device's browser. Creating another link revokes the old token.

The server stores only a SHA-256 hash of the token. The display sends `deviceHeartbeat` to update `lastSeen`; “Online” means a heartbeat arrived within the last 90 seconds. The API does not return the token hash. A tokenized display link obtains only its assigned resource through `displaySnapshot`. A normal link without a token requires sign-in and does not report device presence.

First-version displays are view-only, as allowed in `frontend_en.md`. The user must click to enter full-screen mode; Android/Chrome kiosk mode is configured on the device itself.

## Time and data persistence

Form dates and times use the selected office's time zone, not the user's computer time zone. OData receives UTC. A nonexistent or ambiguous time during clock changes is rejected with an explanation. The server rechecks availability for every write, and the interface refreshes after a conflict.

The weekly plan is stored in `WorkDays`, separately from recurring reference `WorkSchedules`. One `WorkDays` record identifies one employee and date. Choosing an office day alone does not create a booking: **Pick a desk** opens search with that day's date, office, and time.

The frontend reads data through OData and uses `/auth` for sign-in and sign-out. By default, Docker Compose connects it to Rust on port `4005` through a proxy: the application is at `http://localhost:4004`, and all authentication and data requests use the same origin. Start the backend separately. Connection settings and switching to CAP are described in [DOCKER_en.md](DOCKER_en.md#connecting-to-the-rust-backend).

`BACKEND_URL` sets Rust's address for Node.js: `http://rsvroom-backend:4005` on the shared Docker `rsvroom-network`, or `http://127.0.0.1:4005` for a local start. The proxy forwards cookies, Host, Origin, language, plan images, and batch request bodies unchanged. In this mode, the browser API URL is always `/odata/v4/booking/`; `ODATA_SERVICE_URL` is ignored. Profiles may arrive as a CAP array or as Rust `{ "value": [...] }`. The CAP CSRF-token HEAD request is disabled for Rust, while the backend still checks Origin.

Without `BACKEND_URL`, local CAP services and authentication are used. `ODATA_SERVICE_URL` retains its previous role in this mode and defaults to `/odata/v4/booking/`.

For Rust, the editor explicitly sends raster dimensions and generates an area name using the same initials-and-next-number algorithm as CAP. Before adding or duplicating, it reloads the floor's area names. CAP assigns names in a server transaction; Rust's client selects the number, so strictly unique numbering under simultaneous edits by multiple administrators needs Rust-side support.

The Rust JSON batch preserves operation order and `atomicityGroup`; it does not send `dependsOn`. Displays accept both a CAP string snapshot and a Rust `{ resource, bookings }` object with nested floor and office structures. No extra user data is requested; state is shown using active flags from the backend snapshot.

## Tests

```powershell
npm test
npm run test:ui
```

`npm test` checks the API, team restrictions, weekly plans, tokens, SVG, and time conversion. `npm run test:ui` runs Playwright against a separate in-memory SQLite database on port `4173`; it does not use the working database. On Windows, installed Google Chrome is used automatically. Elsewhere, install Chromium with `npx playwright install chromium`.

Screenshots are in `test-results/`; traces are retained after failures. This directory is excluded from Git and Docker images.

## Later phases

Free profile selection and three roles are implemented; see [ACCESS_en.md](ACCESS_en.md). Corporate SSO is not connected. The integrations tab shows that no integrations are connected; it does not simulate Microsoft 365, Google Workspace, or SAP Calendar synchronization. Check-in with automatic release, recurring booking series, and automatic neighboring-desk selection remain future work from the specification.
