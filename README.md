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
