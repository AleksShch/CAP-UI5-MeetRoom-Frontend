# Working with the database

The application supports a local CAP backend and a frontend connected to a Rust backend through `BACKEND_URL`. By default, Docker Compose uses Rust on port `4005`. In that mode, Node.js does not open SQLite, apply the CDS schema, or create local users. Rust uses a separate database; its structure and migrations are documented in [_RUST/BACKEND_PROJECT_en.md](_RUST/BACKEND_PROJECT_en.md).

Switching backends does not transfer data. The CAP database remains intact, but its file cannot be attached to Rust because the schemas differ. To return to CAP, run `docker compose -f docker-compose.yml -f docker-compose.cap.yml up -d`.

The following instructions concern **CAP mode**: SQLite via `@cap-js/sqlite`, [db/schema.cds](db/schema.cds) as the schema source, and CSV files under `db/data` as initial data. Application access is through the `/odata/v4/booking` OData service.

## Where data is stored

The demo dataset contains one **Demo office floor** in each of Hannover, Berlin, and Warsaw, each with 11 new desks and 3 meeting rooms on `db/data/office-plan.jpg`. The former empty **First Floor** entries have been replaced; their original resources and bookings remain on the same floors. Each office also has **Demo Parking** with 12 spaces on a separate SVG plan. All 78 new resources are linked to plan objects.

For **20 September through 20 November 2026, inclusive**, the dataset contains 540 bookings: 270 desks, 81 meetings, and 189 parking reservations. Nine **Product Team** members have 405 workdays alternating between office and home. Weekends are skipped; 20 September is a Sunday, so the first bookings start on 21 September. Desks and parking spaces are booked from 09:00 to 17:00, and meetings from 10:00 to 11:00 in each office's local time, including the switch to winter time.

| Office | Users |
| --- | --- |
| Hannover | Anna Example, Lena Fischer, Jonas Weber |
| Berlin | Max Example, Emma Schneider, Felix Bauer |
| Warsaw | Ola Example, Marta Kowalska, Piotr Nowak |

Choose a profile on the sign-in page to see its records in **My bookings**. In **My team**, select a date in this period to see teammates' office and home days and links to their desks. **My work week** shows the selected user's plan. The new colleagues have the **User** role; Anna's, Max's, and Ola's roles are retained.

A new database, including `:memory:`, loads this dataset from CSV automatically. To add it to an existing local CAP database, run in PowerShell:

```powershell
$env:BACKEND_URL = ''
$env:CDS_REQUIRES_DB_CREDENTIALS_URL = '.data/rsvroom.sqlite'
npm run seed:demo
```

The import moves records from older additional floors to the original floors, renames them **Demo office floor**, and inserts missing demo records in one transaction. Existing bookings and work plans are preserved. Overlapping bookings and demo bookings on days already planned as home or in another office are skipped. Repeating the explicit import restores deleted demo records when no such conflicts exist; an ordinary application startup does not. After importing, refresh the page and select **Demo office floor** from the floor list or **Demo Parking** under Parking. This command does not import data into Rust.

After intentionally changing the generator or source JPG, regenerate the CSV files with `node scripts/demo-data.js --generate`. Coordinates in the generator are mapped to a 1466 × 803-pixel image; they must be adjusted if the image changes.

| Mode | Database |
| --- | --- |
| Local `npm start` / `npm run dev` | `.data/rsvroom.sqlite` in the working directory |
| Docker | `/app/.data/rsvroom.sqlite` in the named `rsvroom-data` volume |
| Integration tests | Separate in-memory SQLite database |
| Persistence test | Temporary SQLite file deleted after the test |

The host and Docker databases are independent and are not synchronized. Database files, SQLite journals, and `backups/` are excluded from Git and Docker builds.

Set the path with `CDS_REQUIRES_DB_CREDENTIALS_URL`. For example, locally:

```powershell
$env:CDS_REQUIRES_DB_CREDENTIALS_URL = '.data/another.sqlite'
npm start
```

## Initialization and schema application

`scripts/deploy.js`:

1. Creates the directory for the SQLite file.
2. Loads the CDS model and connects to the database.
3. Checks for CAP's `cds_model` table.
4. Applies the CAP schema with `schema_evolution: auto`.
5. Imports CSV only during first initialization; later calls pass an empty set of data sources.

Consequently, restarting does not overwrite edited demo records or restore deleted ones. Changing CSV does not update an existing database; use the API or a dedicated data migration.

```powershell
# Prepare or update the local database
npm run deploy

# Start the application and prepare the database automatically
npm start
```

In Docker Compose, source files are mounted as a volume: a model change restarts the server and applies the schema through `scripts/start.js`. For local `npm run dev`, restart the command to prepare the schema again before `cds watch`. In the `production` image stage, source files are included in the build, so rebuild the image after changing them.

Use this project's `npm run deploy`. Running `cds deploy` directly bypasses the project's “CSV only on first startup” rule and may reimport initial data. Do not pass `--in-memory` if records must persist.

## Changing the model

1. Back up the current database.
2. Change `db/schema.cds` and, if needed, projections in `srv/booking-service.cds`.
3. Update checks in `srv/booking-service.js` if data behavior changes.
4. Run `npm test`.
5. Apply the model to the intended database and inspect the startup log.

Automatic schema evolution retains existing rows for supported changes. Removing columns, changing types, and adding constraints require separate assessment and sometimes data migration. Renaming a field does not guarantee that its contents will move. `cds_model` is an internal CAP table; do not edit it manually.

For SQLite persistence details, see the [SAP CAP documentation](https://cap.cloud.sap/docs/guides/databases/sqlite).

## Main data and relationships

```text
Companies → Sites → Buildings → Floors → Resources → Bookings
    │                                          Bookings → Users
    ├── CompanyDomains
    ├── Users → WorkSchedules → Sites
    ├── Teams → TeamMembers → Users
    └── Equipment ← ResourceEquipment → Resources

Sites → OpeningHours
Resources → Displays
```

Every main entity has a UUID `ID` and managed creation/modification fields. A company can have multiple domains and sites. Geography, address, coordinates, `timeZone`, and `locale` belong to `Sites`.

Resource types are `ROOM`, `WORKPLACE`, `PARKING`, `LOCKER`, and `CAR`. OData `Rooms` and `Workplaces` are read-only views over `Resources`; create resources through `Resources`.

Parking uses the same hierarchy: `Buildings.kind = 'PARKING'` identifies a parking lot within `Sites`; its levels or zones are stored in `Floors`, and its spaces are `Resources` with `type = 'PARKING'` and `capacity = 1`. Ordinary buildings have `kind = 'BUILDING'` (the default, including after upgrading an older database). Parking sections in Administration filter these entities; there is no separate parking-booking table. The type of an existing building or parking lot cannot be changed, and only `PARKING` resources may be placed inside a parking lot.

A plan area may have type `PARKING` and link to a space on the same level. Creating, editing, and cancelling parking bookings uses the usual `Bookings` entity and existing role, company, activity, and interval-conflict checks. Earlier `PARKING` resources on ordinary building floors remain available under Parking.

## Write rules

- Domains are lowercased and unique across the installation. A company can have at most one active domain with `primary = true`.
- Site, building, floor, and resource codes are unique within their respective parent.
- References must point to existing records. A user and a booked resource must belong to the same company; teams, equipment, and employee schedules are checked similarly.
- Changing a parent of an existing branch is forbidden, preventing implicit movement of linked data between companies and sites.
- Deleting a record with incoming references returns `409`. To disable reference data where supported, use `active = false`.
- Deep insert/update is forbidden; create related entities separately and pass fields such as `company_ID` and `floor_ID`.

The service performs these checks. Direct SQL bypasses application handlers and is unsuitable for ordinary data editing.

## Time and bookings

`Bookings.startAt` and `endAt` are absolute instants. Pass an ISO string with `Z` or an explicit offset, such as `2026-09-15T09:00:00+02:00`. The database stores it as UTC; display it using `Sites.timeZone`. The offset depends on the date and daylight-saving transitions.

Confirmed bookings of one resource must not overlap. Intervals are half-open: `09:00–10:00` and `10:00–11:00` are compatible. `CANCELLED` frees the interval; returning to `CONFIRMED` checks conflicts again. These checks also apply to partial `PATCH` requests.

Room capacity limits `attendeeCount`; other resources are booked for one attendee. An inactive user, resource, or part of its hierarchy blocks a confirmed booking. Cancelling an existing booking remains possible.

`OpeningHours` and `WorkSchedules` use the site's local time and ISO weekdays (`1` is Monday, `7` is Sunday). For now they are reference schedules and do not limit booking hours. The start must precede the end within one day.

## Backup

For a simple consistent backup, stop the application and copy the **entire database directory**: SQLite may use `-wal` and `-shm` files.

Example for ordinary Docker mode, with a new backup directory:

```powershell
$backupDir = 'backups/rsvroom-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $backupDir -Force
docker compose stop rsvroom
docker compose cp rsvroom:/app/.data/. $backupDir
docker compose start rsvroom
```

For a local database, stop `npm start` / `npm run dev`, then copy `.data` to a new backup directory.

Restoring a backup replaces current data. Stop the application, save a copy of its current state, and replace the database-directory contents with one complete, consistent set of backup files. Do not mix an older SQLite file with journals from another backup. In Docker, the `node` user must be able to access the directory and files. Then start the application and check the logs and API records.

## Inspecting data

Floor plans and areas are stored separately. `Floors.planImage` contains a JPG/PNG data URL, `planImageName` is the source filename, and `planWidth/planHeight` are image dimensions in pixels. The older `floorPlan` field continues to support SVG.

`FloorObjects` stores `floor_ID`, optional `resource_ID`, name, type (`ROOM`, `DESK`, `PARKING`, `ZONE`, `OTHER`), `x/y` coordinates, `width/height`, `radius`, `color`, and `opacity`. Geometry always uses pixels of the original plan; camera zoom and pan are not saved to the database. A linked resource must be on the same floor. Deleting an area does not delete its resource or bookings. The existing `npm run deploy` updates the schema without discarding data.

```powershell
Invoke-RestMethod 'http://localhost:4004/odata/v4/booking/Companies'
Invoke-RestMethod 'http://localhost:4004/odata/v4/booking/Sites'
Invoke-RestMethod 'http://localhost:4004/odata/v4/booking/Bookings?$expand=resource,user'
```

For SQL analysis, open a backup copy of SQLite in a suitable editor. The full set of entities appears in the [OData metadata](http://localhost:4004/odata/v4/booking/$metadata).

Concurrent-booking protection is designed for one CAP process: the SQLite pool uses one connection, and writes within a shared batch transaction are also serialized. Moving to multiple processes or another database requires revisiting the locking strategy.

## Sign-in data and roles

`Users.role` accepts `USER`, `KEY_USER`, and `ADMIN`, with `USER` as the default. `Users.passwordHash` contains a salted scrypt hash and is excluded from OData. `AuthSessions` stores a token hash, user UUID, and session expiry and is not exposed through the service.

Schema upgrades add fields and tables without deleting existing users or bookings. Passwordless profile selection is enabled by default; neither a password nor a setup token is required. Demo roles are assigned once, recorded in the internal `AuthSettings` table; later restarts preserve role changes. `passwordHash` is used only when password mode is explicitly enabled. See [ACCESS_en.md](ACCESS_en.md) for profile selection and role changes.
