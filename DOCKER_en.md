# Working with Docker

Run commands from the project root in PowerShell. Docker Desktop must be running in Linux-container mode.

## First startup

The frontend and Rust backend share the external network `rsvroom-network`. Before starting, attach the backend container to this network with the DNS alias `rsvroom-backend`. If the network does not exist, run `docker network create rsvroom-network`.

```powershell
docker compose up --build -d
docker compose ps
docker compose logs -f rsvroom
```

Application: <http://localhost:4004/>. API: <http://localhost:4004/odata/v4/booking/>. Health check: <http://localhost:4004/health>.

`Ctrl+C` stops following logs; the container keeps running. The application URL opens RsvRoom. By default it connects to the separately running Rust backend on port `4005`; Rust creates its tables and demo data. Backend instructions: [_RUST/README_en.md](_RUST/README_en.md).

The main Compose file already enables development mode: source changes are available inside the container through a volume, without rebuilding the image.

## Connecting to the Rust backend

`docker-compose.yml` sets `BACKEND_URL: ${BACKEND_URL:-http://rsvroom-backend:4005}`. Docker resolves `rsvroom-backend` on the shared `rsvroom-network`. The browser connects to `http://localhost:4004`, and Node.js proxies `/auth`, `/odata/v4/booking`, `/api/v1`, `/health`, and `/api/health` to Rust. There is no need to set an absolute Rust URL in `ODATA_SERVICE_URL`. The proxy preserves Host and Origin, so the backend's Origin check still works; this setup requires no browser-to-API CORS configuration.

After changing project dependencies, run:

```powershell
docker compose stop rsvroom
docker compose build rsvroom
docker compose run --rm --no-deps rsvroom npm ci --include=dev
docker compose up -d
```

Check Rust connectivity from the container:

```powershell
docker compose exec rsvroom node -e "fetch('http://rsvroom-backend:4005/health').then(async r => console.log(r.status, await r.text()))"
```

`rsvroom-backend:4005` is the backend's name and internal port on the Docker network. The backend port does not have to be published on the host for container-to-container communication. Rust must listen on `0.0.0.0:4005` inside its container. When running Node.js directly on Windows, use the published address `http://127.0.0.1:4005`.

To use another backend address, set the variable and recreate the container:

```powershell
$env:BACKEND_URL = 'http://host.docker.internal:4006'
docker compose up -d
```

In Rust mode, Node.js does not open the local CAP SQLite database or run CAP migrations or local-user setup. The existing `rsvroom-data` volume remains intact. CAP and Rust databases are independent; switching backends does not move data. Sign in again after switching. If Rust is unavailable, the API returns `502` and the health check fails; it does not switch to another database automatically.

To return to CAP with its existing database:

```powershell
docker compose -f docker-compose.yml -f docker-compose.cap.yml up -d
```

To enable Rust again, run `docker compose up -d`.

## What starts

| File | Purpose |
| --- | --- |
| `dockerfile` | Node.js 22, Linux dependencies, and local UI5 build; `development` stage with file watching and `production` stage with `npm start`; runs as `node` with a health check |
| `docker-compose.yml` | `rsvroom` service using the `development` stage, port `127.0.0.1:4004`, mounted source, and separate volumes for dependencies, UI5, and the database |
| `docker-compose.dev.yml` | Compatibility with older two-`-f` commands; no longer needed for development |
| `docker-compose.cap.yml` | Explicitly clears `BACKEND_URL` to start the local CAP backend |
| `nodemon.docker.json` | Polls server files and restarts after a 500 ms delay |
| `.dockerignore` | Excludes Windows `node_modules`, databases, `.env`, logs, tests, and backups from the build context |

The project lives at `/app` inside the container. Compose runs `npm run dev:docker`: it first checks the local UI5 build, then `nodemon` starts `scripts/start.js`. When `BACKEND_URL` is set, Express serves the interface and proxy on port `4004`. In CAP mode, the script applies the schema through `scripts/deploy.js` and starts CAP with `/app/.data/rsvroom.sqlite`.

The build file is explicitly named `dockerfile`, so the build also works on case-sensitive Linux file systems.

## Routine operations

```powershell
# Stop or start the existing container
docker compose stop
docker compose start

# Restart
docker compose restart rsvroom

# Remove the container and network; keep data
docker compose down

# Rebuild after changing the Dockerfile
docker compose up --build -d

# Recent application logs
docker compose logs --tail 100 rsvroom

# Open a shell in the container
docker compose exec rsvroom sh
```

No Docker command is needed after a source edit: just save the file. Use `restart` after changing file-watching settings or `ui5.yaml`; after changing a Compose file, run `docker compose up -d`. The service uses `restart: unless-stopped`.

## Persistent data

Compose creates a `rsvroom-data` volume prefixed with the project name, usually `cap_rsvroom-data`. Only the local CAP backend uses it. The database survives `stop`, `restart`, `down`, and image rebuilds. CSV files are loaded only when the CAP database is first initialized. Rust data is stored separately in its project or Docker volume.

The following commands **delete the database**, dependencies, and UI5 build together with their volumes. Use them only for an intentional reset of a demo installation:

```powershell
docker compose down -v
docker compose up -d
```

The backup procedure is in [DATABASE_en.md](DATABASE_en.md). Changing the Compose project name with `-p`, or renaming the project directory, causes Docker to use different volumes; the old database remains in its previous volume.

## Changes without rebuilding

| Volume | Purpose |
| --- | --- |
| `.:/app` | Current project directory; saved files become available in the container immediately |
| `rsvroom-node-modules:/app/node_modules` | Linux dependencies, separate from Windows `node_modules` |
| `rsvroom-ui:/app/gen` | Built UI5 libraries and their build timestamp, initially copied from the image |
| `rsvroom-data:/app/.data` | Persistent SQLite database, separate from the local host database |

Changes under `app/` (JavaScript, CSS, HTML, XML, i18n) appear after refreshing the browser page. If the browser keeps an older module, use `Ctrl+F5`. Open tabs do not refresh automatically.

Changes in `server.js`, `srv/`, `db/`, `_i18n/`, `scripts/`, and CAP settings automatically restart the server. `nodemon` polling also detects changes through Docker Desktop on Windows. After saving, wait a few seconds for the ready message in the logs. In CAP mode, changing the CDS model also applies the schema; existing records survive supported changes. CSV files are not reimported. With Rust, changing the CDS model does not change its SQL schema.

After changing `package.json` or `package-lock.json`, update dependencies in the volume. Rebuilding the image alone does not update an existing `node_modules` volume. These commands also work when migrating from the older development setup:

```powershell
docker compose stop rsvroom
docker compose run --rm --no-deps rsvroom npm ci --include=dev
docker compose up -d
```

If UI5 dependencies have changed, restart the service; its startup check will rebuild the libraries. To force a build and update the software version shown in the header:

```powershell
docker compose exec rsvroom npm run build:ui -- --force
```

Saving source files does not change the build timestamp. In development, `gen/` lives in a separate volume, so rebuilding the Docker image also does not replace the existing UI5 cache or its timestamp.

## Image without mounted source

A normal Dockerfile build selects the final `production` stage, which runs `npm start`. To build a standalone image containing the source:

```powershell
docker build --target production -f dockerfile -t rsvroom:production .
```

Compose explicitly selects the `development` stage. The older `-f docker-compose.yml -f docker-compose.dev.yml` form still behaves like the main file.

## Troubleshooting

- Cannot connect to the Docker engine: start Docker Desktop and wait for the Linux engine to become ready.
- Port `4004` is occupied: stop the application using it, or change the published Compose port, for example to `127.0.0.1:4005:4004`.
- Native SQLite module error: rebuild the image and ensure Windows `node_modules` is not mounted over Linux dependencies.
- Schema error: check `docker compose logs rsvroom`; the schema-change procedure is in [DATABASE_en.md](DATABASE_en.md).
- `unhealthy` status: check the logs and run `docker compose exec rsvroom node -e "fetch('http://127.0.0.1:4004/health').then(async r => console.log(r.status, await r.text()))"`.

This configuration is intended for local development: the published port is bound to loopback, and passwordless profile and role selection is enabled by default. No password or setup token is required. See [ACCESS_en.md](ACCESS_en.md) for profiles and permissions, and [PROJECT_en.md](PROJECT_en.md) for architecture and implementation scope.
