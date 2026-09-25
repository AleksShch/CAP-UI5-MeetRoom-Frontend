# RsvRoom Rust Backend

A standalone backend for booking meeting rooms, workplaces, and parking spaces, built with **Rust, Axum, Tokio, SQLx, and SQLite**. It follows the [Rust backend discussion](https://chatgpt.com/share/6aa58b53-f7ac-83eb-bb6a-5ef7f9f7f737), the documents under `_CAP/`, and the existing CAP project's model. Neither Node.js nor CAP is required to run it.

## Running

You need Rust with edition 2024 support; the project is checked with Rust 1.98.1. On Windows, use the MSVC toolchain with Visual Studio C++ Build Tools.

```powershell
cargo run --locked
```

Health check: <http://localhost:4005/health>. The root path returns API information. This project contains the backend, not the UI5 frontend.

On first startup, a migration creates `.data/rsvroom.sqlite` and 56 demo records: Example GmbH, Hannover, Berlin, Warsaw, resources, and users. Initially there are no bookings. Later starts preserve edited data and roles. The CAP database is neither read nor changed.

Optional settings: copy `.env.example` to `.env`. By default, the server listens at `127.0.0.1:4005`. If this port is occupied, choose another, for example `$env:RSVROOM_BIND = '127.0.0.1:4006'`.

```powershell
$base = 'http://localhost:4005'
$login = @{ userID = '60000000-0000-4000-8000-000000000001' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body $login -SessionVariable session
Invoke-RestMethod -Uri "$base/odata/v4/booking/Rooms" -WebSession $session

$payload = @{
    resource_ID = '50000000-0000-4000-8000-000000000001'
    title = 'Project planning'
    startAt = '2026-09-15T09:00:00+02:00'
    endAt = '2026-09-15T10:00:00+02:00'
    attendeeCount = 4
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/odata/v4/booking/Bookings" -WebSession $session -ContentType 'application/json' -Body $payload
```

If a new booking omits `user_ID`, the server uses the current user. More HTTP examples are in [docs/booking-api.http](docs/booking-api.http).

## Implemented features

- CRUD for Companies, CompanyDomains, Sites, Buildings, Floors, FloorObjects, Resources, Users, Teams, TeamMembers, Bookings, WorkDays, WorkSchedules, OpeningHours, Equipment, ResourceEquipment, and Displays. Rooms and Workplaces are read-only views.
- Relationships, UUIDs, required fields, ranges, IANA time zones, unique codes, domain/email normalization, immutable parents, and protection against deleting dependent records or performing deep writes.
- Company, hierarchy activity, capacity, restricted-team, and interval-conflict checks. PATCH merges changes with the current record before validation; cancellation frees time and reconfirmation checks it again. A workplace and parking space may be booked together.
- `USER` / `KEY_USER` / `ADMIN` roles, own bookings and weekly plans, a ban on booking for others even as an administrator, permission-based deletion of other people's bookings, and protection of the last administrator. Roles are reloaded for every request and every batch operation.
- Profile or password sign-in, 12-hour sessions, SHA-256 token hashes, HttpOnly/SameSite=Strict cookies, salted scrypt passwords, one-time initial setup, and session revocation when passwords change.
- Floor plans and objects; technical display tokens; `provisionDevice`, `deviceHeartbeat`, and `displaySnapshot`. A snapshot reveals no account or unrelated-resource data.
- Migrations, persistent SQLite, Docker, graceful shutdown, a health check, structured errors, and HTTP tracing.

## HTTP contract

The main endpoint is `/odata/v4/booking`. It preserves CAP demo entity names, JSON fields, and UUIDs. It supports `GET`, `POST`, `PATCH`, `DELETE`, `Bookings(UUID)` keys, `$metadata`, `currentUser()`, direct navigation-property reads, JSON batch, and multipart changesets.

This is a **limited OData adapter**, not a complete implementation of OData V4. Integration tests cover the supported subset; compatibility with every screen of the existing UI5 application without adaptation has not been confirmed.

| Query | Support |
| --- | --- |
| `$filter` | `eq ne gt ge lt le`, `and or not`, parentheses, `contains`, `startswith`, `endswith`; public scalar fields |
| `$select` | Public-field list or `*`; ID remains in the response |
| `$expand` | Relationships, nested `$expand`, and collection parameters; depth up to 4 and up to 5,000 records per response |
| `$orderby` | Multiple fields, `asc`/`desc`, stable ordering by ID |
| `$top`, `$skip`, `$count` | 100 records by default, maximum 1,000; count and nextLink; `Entity/$count` |
| `$batch` | Up to 100 sequential requests; a contiguous `atomicityGroup` or multipart changeset rolls back completely on error |

Unsupported features are `$search`, `$apply`, `any/all`, computations and navigation paths inside `$filter`, ETag/If-Match, PUT, deep writes, Content-ID references/dependsOn, and nested batch requests. Unsupported parameters are rejected. Concurrent PATCH writes use the last successfully saved change. `$metadata` describes entities and `currentUser`; invoke actions with HTTP POST as shown in the API examples.

REST paths are alternate spellings: `/api/v1/companies`, `/api/v1/resources/UUID`, `/api/v1/bookings`, `/api/v1/floor-objects`, and other kebab-case entities. JSON fields and query parameters remain the same; collections return `{ "value": [...] }`. This is not a separate business-logic contract.

Every signed-in user can read reference data and bookings. As in the original project, this does not isolate tenants. OpeningHours and WorkSchedules are reference data and do not limit booking hours. The current implementation has no SSO, calendar synchronization, PostgreSQL, or UI5 frontend.

## Users and passwords

`profile` mode is intended for local demos: any visitor may choose an active profile, including an ADMIN.

| Profile | UUID ends in | Role |
| --- | --- | --- |
| Anna Example | `000001` | ADMIN |
| Max Example | `000002` | KEY_USER |
| Ola Example | `000003` | USER |

`GET /auth/profiles` returns `{ "value": [...] }`. `POST /auth/login` accepts `userID` and sets a cookie; the role comes from the database. `/auth/session` returns the user, and `/auth/logout` revokes the session. A `role` supplied to login does not affect permissions.

For password mode:

```powershell
$env:RSVROOM_AUTH_MODE = 'password'
cargo run --locked -- setup-token
cargo run --locked
```

The token lasts 15 minutes and is stored as a hash. Call `POST /auth/setup` with `email`, `token`, and a 12–256-character `password` for an existing active administrator such as `anna@example.com`. Then `/auth/login` accepts `email` and `password`. Profile listing is disabled in this mode. After 10 failures for one email address, sign-in is blocked until a five-minute window ends. If active users in different companies share an email address, password sign-in is rejected; use unique email addresses in this mode.

`POST /odata/v4/booking/setUserPassword` accepts `userID`, `password`, and `currentPassword`. An administrator can assign another user's password; changing one's own password requires the current one. All sessions of the target user are revoked. Neither hashes nor passwords can be read or written through ordinary CRUD.

Set `RSVROOM_SECURE_COOKIE=true` for HTTPS. For a separate frontend, set an exact `RSVROOM_CORS_ORIGIN`, such as `http://localhost:8080`, and send requests with credentials. SameSite=Strict assumes the frontend and API are on the same site. Mutating requests with a foreign Origin are rejected.

## Database and structure

```text
src/main.rs          server startup and shutdown, CLI
src/config.rs        environment settings
src/api/             HTTP, limited OData, query parser, batch
src/auth.rs          profiles, sessions, passwords, and setup
src/services.rs      write permissions and business rules
src/domain/          entity schema and demo data
src/repository.rs    parameterized SQL and initialization
migrations/          versioned SQL schema
tests/backend.rs     integration checks
```

`schema.json` describes types, constraints, and relationships for shared CRUD; SQL migrations create the actual relational tables, foreign keys, indexes, and triggers. HTTP handlers call services; SQL lives in the repository and specialized authentication/booking operations. SQLx compiles without a database.

All writes use `BEGIN IMMEDIATE`. One SQLx connection serializes operations within the process, while SQLite locks competing writers across connections. Another trigger forbids overlapping confirmed bookings. An integration test uses two independent pools against one file. This is local-disk SQLite, not a distributed database cluster.

Changing the model requires a new SQL migration and matching `schema.json`/validation changes. Do not edit migrations already applied: SQLx checks their checksums. `cargo run --locked -- migrate` applies migrations without starting HTTP. The seed loads once in a transaction marked `seed-v1`; changing `seed.json` does not overwrite working data.

To back up, stop the server and copy the entire `.data` directory, including possible `-wal`/`-shm` files. Do not attach an existing CAP SQLite file: the schemas are independent and user data is not transferred automatically.

## Docker

```powershell
docker compose up --build -d
docker compose logs -f backend
docker compose down
```

The Linux multi-stage image runs as an unprivileged user. Its port is published on loopback, and the database resides in the named `rsvroom-rust_rsvroom-data` volume. Ordinary `down`, restart, and rebuild operations preserve data; deleting the volume deletes the database.

For development with mounted source and separate Linux caches:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Restart the service after editing Rust files so `cargo run` rebuilds the application. For initial setup in a production container, run `docker compose exec backend rsvroom-backend setup-token` when `RSVROOM_AUTH_MODE=password`.

## Checks

```powershell
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

Tests use in-memory SQLite and temporary directories rather than the working database. The password test performs real scrypt and is noticeably slower than other tests in a debug build.
