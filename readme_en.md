# RsvRoom / MeetRoom CAP

An application for booking meeting rooms, desks, and parking spaces. It has an OpenUI5 interface and can use either a Rust backend or a local SAP CAP Node.js 9 backend with SQLite.

## Documentation

- [docs/MVC_en.md](docs/MVC_en.md) — MVC architecture, layer responsibilities, and development guidelines.
- [PROJECT_en.md](PROJECT_en.md) — project structure, data model, API, request examples, and tests.
- [DOCKER_en.md](DOCKER_en.md) — Docker startup, development, volumes, rebuilding, and troubleshooting.
- [DATABASE_en.md](DATABASE_en.md) — data storage, initialization, schema changes, and backups.
- [ACCESS_en.md](ACCESS_en.md) — profile selection, users, and roles.
- [docs/booking-api.http](docs/booking-api.http) — ready-to-use HTTP requests.

## Running the application

First, start the Rust backend on port `4005` as described in [_RUST/README_en.md](_RUST/README_en.md). Then run:

```powershell
docker compose up --build -d
```

Application: <http://localhost:4004/>. API: <http://localhost:4004/odata/v4/booking/>.

By default, Compose forwards authentication and API requests to Rust at `http://rsvroom-backend:4005`. Both containers must join the external `rsvroom-network`; the backend must have the alias `rsvroom-backend`. Source files are mounted as a volume: interface changes appear after a page refresh, while server changes automatically restart Node.js. Rust stores its database separately; an existing CAP database volume is retained. See [DOCKER_en.md](DOCKER_en.md) for details.

Without Docker, run `npm ci`, set `$env:BACKEND_URL = 'http://127.0.0.1:4005'`, and then run `npm start` (PowerShell, Node.js 22+). Without `BACKEND_URL`, the local CAP backend starts instead. To use CAP in Docker, run `docker compose -f docker-compose.yml -f docker-compose.cap.yml up -d`.

Run `npm test` and `npm run test:ui` for checks. To test against a running Rust backend, use `npm run test:ui:rust`.

The selected backend initializes its own reference data on first startup. Later restarts preserve changes and bookings. Data is not transferred automatically between CAP and Rust.

The OpenUI5 interface supports profile selection without a password. Anna is an administrator, Max is a key user, and Ola is a regular user; see [ACCESS_en.md](ACCESS_en.md). Corporate SSO and calendar integrations are not connected yet.
