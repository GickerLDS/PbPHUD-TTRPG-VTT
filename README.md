# PBPHud Modern Map App

This is a new Node.js/MariaDB/React implementation for the legacy PBPHud map system. It is intentionally isolated from the Joomla/PHP webroot. No legacy files are required to be edited.


## What This First Version Includes

- Express API with MariaDB connection pooling.
- MariaDB schema for map records and map metadata.
- A compatibility parser/serializer for the legacy `mapdata` format.
- Read-only tile asset serving from the app-local `assets/tiles` folder.
- React canvas editor for loading maps, browsing tiles, placing tiles, erasing tiles, and saving through the API.

## Setup

1. Use Node.js `20.19.0+` or `22.12.0+`.
2. Create a MariaDB database and user.
3. Copy `.env.example` to `.env` and update the DB values.
4. Install packages:

```powershell
npm.cmd install
```

5. Make sure MariaDB is running at the host and port in `.env`.

If you have Docker Desktop, this repo includes a local MariaDB service that uses your `.env` values:

```powershell
docker compose up -d mariadb
```

Without Docker, start your MariaDB/MySQL service manually and create the database/user named in `.env`.

6. Run the schema migration:

```powershell
npm.cmd run db:migrate
```

7. Start development mode:

```powershell
npm.cmd run dev
```

The React app runs on `http://127.0.0.1:5173` by default. The API runs on `http://127.0.0.1:3001`.

To use a different development host, port, or custom domain, update `.env`:

```dotenv
CLIENT_HOST=0.0.0.0
CLIENT_PORT=8080
CLIENT_ORIGIN=http://maps.example.com:8080
CORS_ORIGINS=https://other-app.example.com
```

`CLIENT_ORIGIN` is optional for local development; when omitted, it is built from `CLIENT_HOST` and `CLIENT_PORT`. The API always allows `CLIENT_ORIGIN` through CORS; use `CORS_ORIGINS` only for extra allowed domains. If you set `CLIENT_ORIGIN` or `API_ORIGIN`, include the port there too because those full URLs override the host/port pieces. Vite serves HTTP by default, so use an `https://` client origin only when a reverse proxy or Vite TLS config is serving HTTPS for that domain.

Check backend and database health:

```powershell
Invoke-WebRequest http://127.0.0.1:3001/api/health -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3001/api/db/health -UseBasicParsing
```

## Self-Contained Assets

The tile images used by the map editor live in `assets/tiles`. The app no longer depends on `../maps/t` by default, so `map-node-app` can be copied to a dev server as a standalone project.

Tile files are organized into category folders and renamed with descriptive prefixes while preserving the original legacy tile code after `--`, for example `terrain/floors/floor-terrain--a20rkg.gif`. The API reads `assets/tile-manifest.json` to map legacy tile codes to their organized file paths.

To regenerate the asset organization after adding tiles:

```powershell
node scripts/organizeTiles.js
```

For deployment, copy the whole `map-node-app` folder except generated/dependency folders such as `node_modules` and `dist` if you plan to rebuild on the server. Then run:

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run build
npm.cmd run start:prod
```

## Legacy Format Notes

The old map table stores compact records in `mapdata`.

- Tile record: `_aXXYYCCCCCC`
- `XX`: 1-based grid column.
- `YY`: 1-based grid row.
- `CCCCCC`: six-character tile code, where the first character doubles as the layer.
- Text/object record: `_t...` until the next underscore.

The parser keeps unknown payloads in memory so migration tools can inspect them later. The current React editor focuses on tile placement first.

## Production Notes

- Copy tile assets into managed object storage or a new app-owned asset directory before public launch.
- Chummer campaign sync uses `PBPHUD_INTEGRATION_TOKEN`; configure the same value as Chummer's `PBPHUD_VTT_API_TOKEN`.
- Imported Chummer campaign maps are owner-editable. Campaign players can view maps, use measurement tools, and control entities whose `ownerId` is their Chummer user ID.
- The local React prototype sends `X-PBPHUD-Viewer-Id` from the viewer selector or `?viewerUserId=...`; replace this with a real session/SSO identity before public launch.
- Add explicit import scripts once a real legacy database dump is available.
- Put the app behind HTTPS and a reverse proxy.
