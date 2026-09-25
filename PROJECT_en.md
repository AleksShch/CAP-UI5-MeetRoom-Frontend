# RsvRoom project structure and operation

RsvRoom / MeetRoom helps employees plan office attendance and book desks, meeting rooms, and parking spaces across company locations. The first phase: local Docker, SAP CAP Node.js, SQLite, and OData V4.

## Application functionality

Employees sign in by selecting an active profile. The default demo mode requires no password; an optional password mode is available. The header shows the selected office, date, language, profile, role, and software build time. The interface is available in English and German, works on desktop and mobile screens, and keeps the selected office and language between visits. Profile changes refresh the available sections and personal data.

The application organizes resources by **company → site (office) → building or parking lot → floor or parking level → resource**. Each office may have several buildings and parking lots. Resource details include location, capacity, equipment, active status, and optional team restrictions. Availability depends on the chosen date and time and is checked again by the backend when a booking is saved, so two people cannot reserve the same resource for overlapping periods.

| Area | What users can do |
| --- | --- |
| **Overview** | See today's booked desk, upcoming room bookings, availability totals, and teammates' plans; open a relevant resource or start a new booking. |
| **Find a space** | Choose office, building, floor, date, and time; filter by equipment; browse desks and linked zones on a floor plan or in a list; inspect a resource and reserve an available desk. |
| **Meeting rooms** | Filter rooms by attendee capacity and equipment, inspect their schedule and available intervals, then book a room with a title and attendee count. |
| **Parking** | Choose a parking lot, level, date, and time; select an available parking space on the plan or in the list; create a reservation independently of a desk booking. |
| **My bookings** | View personal reservations for desks, rooms, and parking; open the resource, change an owned booking, or cancel it. Key users and administrators can also view bookings they are permitted to delete. |
| **My work week** | Mark each weekday as office, home, vacation, or business trip; choose the office and working hours for office days; save dated plans and jump to desk selection. A work plan does not itself reserve a desk. |
| **My team** | Choose a team and date to see who plans to work in the office or from home. For colleagues with desk reservations, open the linked desk. |

Booking forms use the selected office's time zone and send absolute timestamps to the backend. The booking record identifies its owner, resource, time interval, title, status, and attendee count. Cancelling a booking releases its time slot while retaining the record. A workplace and a parking space can be booked for the same period.

**Administrators** manage companies, domains, sites, buildings, parking lots and levels, floors, resources, equipment, teams, users, and displays in **Administration**. They can upload a JPG/PNG or SVG floor plan, draw and name areas, move or resize them, change their corner radius, duplicate or delete them, and link each area to a resource on the same floor. The editor works for office floors and parking levels. Geometry edits save in the background; resource-linked areas appear on booking plans, while all areas remain visible in the editor.

The **display** pages show the current and next booking, availability, and remaining time for a room, desk, or parking resource. An administrator can register a display and create a device link; its token grants access only to the assigned resource's snapshot. Displays are read-only in the current implementation.

Permissions are enforced by the backend as well as the interface. A regular `USER` manages their own bookings and work plan. A `KEY_USER` can also add regular users in their company and delete other people's permitted bookings. An `ADMIN` additionally manages reference data, roles, floor plans, and displays. No role may create a booking on another user's behalf. See [ACCESS_en.md](ACCESS_en.md) for the full access matrix.

The local CAP demo dataset includes offices in Hannover, Berlin, and Warsaw, mapped desks, rooms, and parking spaces, and dated work plans and reservations for nine teammates from 20 September through 20 November 2026. Choose different profiles and dates to explore personal bookings and office presence. The exact dataset and import procedure are in [DATABASE_en.md](DATABASE_en.md#where-data-is-stored).

The interface can use the bundled local CAP backend or connect through Node.js to the separate Rust backend. Corporate SSO, external calendar synchronization, automatic check-in, and recurring booking series are not part of the current application.

## Run locally without an external backend

You can run the OpenUI5 interface and the bundled CAP service together on your computer. No Rust server, Docker container, or connection to port `4005` is required. CAP stores data in the local SQLite file `.data/rsvroom.sqlite`.

Install Node.js 22 or newer, open PowerShell in the project root, and run:

```powershell
npm ci
$env:BACKEND_URL = ''
$env:RSVROOM_AUTH_MODE = 'profile'
npm start
```

Setting `BACKEND_URL` to an empty string selects the local CAP service even if a Rust URL was set earlier in the terminal. `profile` mode enables the demo sign-in screen without passwords. The `prestart` script prepares the local UI5 runtime, and `scripts/start.js` applies the CDS schema before starting the web server.

Open <http://localhost:4004/> and select a demo profile, such as Anna Example. The local OData API is available at <http://localhost:4004/odata/v4/booking/>. Stop the server with `Ctrl+C`.

On a fresh database, startup imports the CSV demo data automatically, including offices, mapped resources, users, work plans, and bookings. Later starts retain changes and do not reimport CSV. If `.data/rsvroom.sqlite` already existed before the latest demo data was added, stop the application, run `npm run seed:demo` in the same PowerShell session, and then run `npm start` again. See [DATABASE_en.md](DATABASE_en.md#where-data-is-stored) for the import details.

Environment instructions: [DOCKER_en.md](DOCKER_en.md). Data storage, schema development, and backups: [DATABASE_en.md](DATABASE_en.md).

## Quick start with the Rust backend

```powershell
docker compose up --build -d
```

First start the Rust backend on port `4005` using its [instructions](_RUST/README_en.md). Open <http://localhost:4004/>. Docker Compose starts the RsvRoom interface with a Rust proxy by default; the API is at <http://localhost:4004/odata/v4/booking/>. Users, roles, and data come from Rust.

Without Docker, install Node.js 22 or newer and npm:

```powershell
npm ci
$env:BACKEND_URL = 'http://127.0.0.1:4005'
npm start
```

When `BACKEND_URL` is unset, `npm start` runs the original CAP backend with its own SQLite database. To use CAP in Docker, run `docker compose -f docker-compose.yml -f docker-compose.cap.yml up -d`. Connection details are in [DOCKER_en.md](DOCKER_en.md#connecting-to-the-rust-backend).

## Architecture

The interface and local server follow MVC: models own data and rules, views own screens and responses, and controllers handle actions and requests. The file map, layer interactions, and checks are described in [docs/MVC_en.md](docs/MVC_en.md).

With `BACKEND_URL`, the flow is:

```text
Browser / OpenUI5 → Node.js :4004 (interface + proxy) → Rust :4005 → Rust SQLite
```

Authentication `/auth`, OData `/odata/v4/booking`, REST `/api/v1`, and health checks are forwarded to Rust. Session cookies, original Host/Origin, and request bodies are preserved. The local CAP backend and database are not started in this mode; an unavailable Rust backend returns an error rather than switching to CAP. The Rust `value` envelope for profiles is normalized, and the CAP CSRF-token HEAD request is disabled for Rust. OData pagination and JSON batch use the existing API client.

Without `BACKEND_URL`, CAP uses this architecture:

```text
Client / OpenUI5 interface
                ↓ HTTP / OData V4
          BookingService
                ↓ validation and transaction
          rsvroom CDS model
                ↓
             SQLite
```

CAP provides standard read, create, update, and delete operations, OData metadata, and `$filter`, `$select`, `$expand`, `$orderby`, `$top`, and `$skip` queries. Application handlers add booking and relationship checks.

| Path | Purpose |
| --- | --- |
| `db/schema.cds` | Company, site, resource, user, and booking model |
| `db/data/*.csv` | Demo data for a new database |
| `srv/booking-service.cds` | Entities exposed through OData |
| `srv/booking-service.js` | Relationship, domain, capacity, activity, and time-overlap checks |
| `scripts/deploy.js` | Creates and updates the persistent database |
| `scripts/start.js` | Selects Rust frontend/proxy mode or prepares the database and starts CAP |
| `srv/frontend-server.js` | Interface and Rust proxy without starting CAP or the local database |
| `srv/web.js` | Shared interface, UI5, and application-configuration routes |
| `test/*.test.js` | OData, batch, and SQLite persistence integration tests |
| `docs/booking-api.http` | Request examples |
| `app/` | OpenUI5 interface in English and German |
| `srv/auth.js` / `srv/authorization.js` | Sign-in, sessions, and server-side checks for three roles |

`npm test` checks CAP and the connection adapter; `npm run test:ui` tests the interface with an isolated CAP database. `npm run test:ui:rust` tests against a running Rust backend at `127.0.0.1:4005` (use `RUST_BACKEND_URL` for another address). That command uses demo profiles and creates temporary floors, resources, parking, and bookings, then deletes only the data it created. A separate Rust test instance in `profile` mode is recommended.

## Domain model

```text
Companies
├── CompanyDomains
├── Sites — offices, branches, headquarters, and other locations
│   ├── Buildings
│   │   └── Floors
│   │       └── Resources
│   │           ├── Bookings
│   │           ├── ResourceEquipment → Equipment
│   │           └── Displays
│   └── OpeningHours
├── Users → WorkSchedules
└── Teams → TeamMembers → Users
```

A UUID identifies the company; primary and additional domains live in `CompanyDomains`. One site can contain multiple buildings, and one city can contain multiple sites. Address, country, city, coordinates, time zone, and locale belong to the site.

Rooms and workplaces share the `Resources` entity and the `Bookings` mechanism. Resource types are `ROOM`, `WORKPLACE`, `PARKING`, `LOCKER`, and `CAR`. `Rooms` and `Workplaces` are read-only views; create and edit resources through `Resources`.

Parking has a separate **Parking** section and separate lists in **Administration**. A parking lot is a `Buildings` record with `kind = 'PARKING'`; levels or zones are `Floors`, and spaces are `PARKING` resources. Levels use the same plan editor as building floors. Parking reservations follow common access rules and appear in **My bookings**. A user may book a workplace and parking space at the same time. Setup steps are in [UI_en.md](UI_en.md#parking).

The demo data includes Example GmbH, `example.com` / `example.de`, Hannover, Berlin, Warsaw, three original meeting rooms and three original workplaces, employees, a team, equipment, displays, and schedules. Additional plan resources and dated bookings are described in [DATABASE_en.md](DATABASE_en.md#where-data-is-stored).

| Example | UUID |
| --- | --- |
| Company | `10000000-0000-4000-8000-000000000001` |
| Hannover site | `20000000-0000-4000-8000-000000000001` |
| First office floor | `40000000-0000-4000-8000-000000000001` |
| First meeting room, capacity 8 | `50000000-0000-4000-8000-000000000001` |
| First workplace | `50000000-0000-4000-8000-000000000002` |
| First employee | `60000000-0000-4000-8000-000000000001` |

## Booking example

PowerShell:

```powershell
$base = 'http://localhost:4004/odata/v4/booking'
$payload = @{
    resource_ID = '50000000-0000-4000-8000-000000000001'
    user_ID = '60000000-0000-4000-8000-000000000001'
    title = 'Project planning'
    startAt = '2026-09-15T09:00:00+02:00'
    endAt = '2026-09-15T10:00:00+02:00'
    attendeeCount = 4
} | ConvertTo-Json

$booking = Invoke-RestMethod -Method Post -Uri "$base/Bookings" `
    -ContentType 'application/json; charset=utf-8' `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($payload))

# Change the title while retaining other fields
Invoke-RestMethod -Method Patch -Uri "$base/Bookings($($booking.ID))" `
    -ContentType 'application/json' -Body '{"title":"Updated planning"}'

# Cancel the booking and free its time slot
Invoke-RestMethod -Method Patch -Uri "$base/Bookings($($booking.ID))" `
    -ContentType 'application/json' -Body '{"status":"CANCELLED"}'
```

Timestamps must include `Z` or a UTC offset. For example, `09:00+02:00` is stored as `07:00Z`. Use `Sites.timeZone` for display, accounting for the date and daylight-saving transitions.

A second confirmed booking for the same resource with an overlapping interval returns `409`. One booking may end exactly when the next begins. Cancellation retains the record; restoring `CONFIRMED` checks availability again.

## Other requests

```http
GET /odata/v4/booking/CompanyDomains?$filter=domain eq 'example.com'&$expand=company
GET /odata/v4/booking/Sites?$expand=buildings($expand=floors)
GET /odata/v4/booking/Resources?$expand=floor($expand=building($expand=site))
GET /odata/v4/booking/Rooms
GET /odata/v4/booking/Workplaces
GET /odata/v4/booking/Bookings?$expand=resource,user&$orderby=startAt
```

More examples for creating resources and bookings are in [docs/booking-api.http](docs/booking-api.http).

## Data checks and limits

- The server checks required values, ranges, references, and whether related records belong to the same company.
- Domains are normalized and unique; a company has at most one active primary domain.
- Room capacity limits attendee count. Other resources are booked as single units.
- An inactive company, site, building, floor, resource, or user prevents a confirmed booking; an existing booking can still be cancelled.
- The parent of an existing branch and a resource's type are immutable. Records with incoming references cannot be deleted; use `active` to disable them where supported.
- Deep writes are forbidden. Create related records through separate endpoints and pass references in fields such as `floor_ID`.
- Transactional batch requests are supported. A conflict in an atomic group rolls back the entire group.

`OpeningHours` and `WorkSchedules` are currently reference information and do not limit booking times. `Displays` stores a device-to-resource assignment; the display-management protocol has not yet been implemented.

## Commands and tests

| Command | Action |
| --- | --- |
| `npm start` | Apply the schema and start the persistent local CAP database |
| `npm run dev` | Apply the schema, then start `cds watch` |
| `npm run dev:docker` | Poll server files and apply the schema on each server restart |
| `npm run deploy` | Apply the schema separately; import CSV only for a new database |
| `npm test` | Run integration tests in isolated databases |

Tests exercise the real OData API: CRUD and site geography, time zones, partial PATCH, cancellation and moves, concurrent requests, JSON/multipart batch, reference integrity, and data survival after redeployment. They do not use the working database.

CAP 9 normalizes incoming dates before application handlers run. The service additionally checks the original JSON retained by the adapter to reject timestamps without a time zone. Transport tests check this compatibility when CAP is upgraded.

## First-phase boundaries

Passwordless sign-in supports profile selection and the `USER`, `KEY_USER`, and `ADMIN` roles. The server checks permissions for ordinary and batch requests; profiles and the access matrix are in [ACCESS_en.md](ACCESS_en.md). Shared visibility of reference data does not provide tenant isolation.

One CAP process and one SQLite connection serialize transactions; writes inside a shared batch transaction are also serialized. Scaling to multiple instances or moving to HANA/PostgreSQL will require another locking strategy.

The UI5 interface covers bookings, weekly plans, teams, administration, and displays. The floor editor is accessible from the left menu and floor list: JPG/PNG background, SVG areas, resource links, drawing, moving, resizing, and zoom/pan. Screen details and URLs are in [UI_en.md](UI_en.md).

Potential next phases are corporate SSO, Microsoft 365 / Google Calendar, booking rules based on work schedules, and an external database if needed.
