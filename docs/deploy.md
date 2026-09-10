# Digital Sarv — production deploy (single VPS, Docker Compose)

Stack (`docker-compose.prod.yml`, project name `digital-sarv-prod`):

| Service | Image | Exposed | Notes |
|---|---|---|---|
| `web` | `digital-sarv/web` (nginx:1-alpine) | **`${HTTP_PORT:-80}:80`**, the only published port | Serves `/`, `/app/`, `/courier/`, `/admin/` with SPA fallbacks; proxies `/api/` → `api:3000` |
| `api` | `digital-sarv/api` (node:24-alpine) | internal only | NestJS; uploads on the `uploads` volume (`/data/uploads`) |
| `mongo` | `mongo:8` | internal only (`backend` network, no internet) | root auth via `MONGO_INITDB_ROOT_*`; volumes `mongo-data`, `mongo-config` |
| `redis` | `redis:8-alpine` | internal only | `requirepass`, AOF; volume `redis-data` |

`.env.production` is used for Compose interpolation (`--env-file`) **and** as the api's `env_file`, so every command below passes `--env-file .env.production`. To keep commands short:

```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'
```

(The root `package.json` has the same via `pnpm docker:build | docker:up | docker:down | docker:logs`.)

The api's `env_file` path defaults to `.env.production`. If you keep the config under another name (e.g. `.env.staging`), pass it to **both** places: `ENV_FILE=.env.staging docker compose -f docker-compose.prod.yml --env-file .env.staging …`. Otherwise the api starts with no environment and refuses to boot.

---

## 1. Server

- Ubuntu 24.04 LTS (or Debian 12), at least 2 vCPU / 4 GB RAM / 40 GB SSD. Building both images on the server needs about 2 GB of free RAM. On a smaller box, build in CI or on a laptop and `docker save | ssh … docker load`.
- A DNS `A` record for the domain (e.g. `sarv.example.ir`) pointing at the server.
- A non-root sudo user with SSH key login.

```bash
# Docker Engine + compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version            # needs v2.24+ (env_file `required:` syntax)

# firewall — Docker-published ports bypass ufw, so publish only what must be public
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

> **Servers in Iran:** Docker Hub and registry.npmjs.org can be blocked or throttled. Set a registry mirror in `/etc/docker/daemon.json` (`{"registry-mirrors": ["https://docker.arvancloud.ir"]}` or similar, then `sudo systemctl restart docker`). For npm, build with `--build-arg NPM_REGISTRY=https://<mirror>/` (both Dockerfiles accept it), or build the images elsewhere and `docker load` them.

## 2. Clone and configure

```bash
sudo mkdir -p /opt/digital-sarv && sudo chown $USER /opt/digital-sarv
git clone <repo-url> /opt/digital-sarv && cd /opt/digital-sarv

cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32   # run once for each of: MONGO_INITDB_ROOT_PASSWORD, REDIS_PASSWORD
openssl rand -hex 48   # JWT_SECRET
nano .env.production
```

Fill in every `CHANGE_ME`:

- The Mongo password appears **twice**: `MONGO_INITDB_ROOT_PASSWORD` and inside `MONGO_URI`. The Redis password also appears twice: `REDIS_PASSWORD` and inside `REDIS_URL`. Use hex secrets so they need no URL-encoding.
- `WEB_PUBLIC_URL`, `API_PUBLIC_URL` and `CORS_ORIGIN` are the public `https://` origin. Behind the bundled nginx, the web and the API share one origin.
- `ADMIN_PHONES` lists the owner's phones, comma-separated. They are upserted as admins on every boot.
- `ZARINPAL_MERCHANT_ID`, plus `SMS_API_KEY` / `SMS_SENDER` / `SMS_OTP_TEMPLATE` (see sections 7 and 8).
- `HTTP_PORT` is `80` when nginx is the edge, or `127.0.0.1:8080` when Caddy or a host proxy terminates TLS.

`MONGO_INITDB_ROOT_*` only take effect when the `mongo-data` volume is **first created**. Changing them later does nothing (use `db.changeUserPassword` in mongosh, then update `MONGO_URI`).

Validate the file:

```bash
dc config >/dev/null && echo OK
```

## 3. Build and start

```bash
dc up -d --build
dc ps                       # all services "healthy" (api needs ~30 s)
curl -fsS http://localhost/healthz          # nginx → ok
curl -fsS http://localhost/api/health       # api liveness
curl -fsS http://localhost/api/health/ready # mongo + redis (503 if a dependency is down)
```

`WEB_PUBLIC_URL` is baked into the web bundle at build time (`VITE_PUBLIC_URL` build arg). After changing it, rebuild with `dc build web && dc up -d web`.

## 4. Seed the base data (once)

The production-safe seed does idempotent upserts of the catalog, prices, plans, rules, campaign, CMS, notification templates, zones and centres. It never creates demo users or orders. The full `seed` (demo data, **drops the DB**) refuses to run in production. Never run it on the server.

The runtime image contains only `dist/` and production dependencies. It has no pnpm and no Nest CLI, so run the compiled script with node:

```bash
dc run --rm api node dist/seed/seed-base.js
```


Re-running it is safe (upserts). Admins then edit everything in `/admin/`.

## 5. TLS (HTTPS)

Pick one option. The nginx in `web` reads `X-Forwarded-Proto` from the proxy in front of it. It sends HSTS only when the original request was HTTPS, and it forwards the scheme to the API.

**A. Caddy in Compose (recommended, automatic Let's Encrypt)**
1. In `.env.production`, set `DOMAIN=sarv.example.ir` and `HTTP_PORT=127.0.0.1:8080`.
2. In `docker-compose.prod.yml`, uncomment the `caddy` service and the `caddy-data` / `caddy-config` volumes. `deploy/caddy/Caddyfile` proxies `{$DOMAIN}` → `web:80` and redirects `www.` to the apex domain.
3. Run `dc up -d`. Caddy obtains and renews certificates by itself. Ports 80 and 443 must be reachable from the internet.

**B. certbot + host nginx.** Install nginx and certbot on the host (`apt install nginx certbot python3-certbot-nginx`). Set `HTTP_PORT=127.0.0.1:8080`, create a host vhost with `proxy_pass http://127.0.0.1:8080;` and `proxy_set_header Host $host; X-Forwarded-For $proxy_add_x_forwarded_for; X-Forwarded-Proto $scheme;`, and set `client_max_body_size 55m;`. Then run `sudo certbot --nginx -d sarv.example.ir`. Renewal runs from the systemd timer.

**C. Cloudflare / ArvanCloud CDN proxy.** Keep `HTTP_PORT=80`, or better, install a Cloudflare Origin Certificate via option B or A and use SSL mode **Full (strict)**. Do not use "Flexible". The CDN sets `X-Forwarded-Proto`. To see real client IPs (for rate limiting), set `CF-Connecting-IP` / `set_real_ip_from` on the edge proxy, or trust one more proxy hop in the API.

In every case, the API sits behind **one** reverse proxy (nginx) with no TLS proxy, or **two** with Caddy, host nginx or a CDN. Set `TRUST_PROXY` in `.env.production` to that hop count: `1` (default) = nginx only, `2` = Caddy / host nginx / CDN + nginx, `3` = CDN + Caddy/host nginx + nginx. It must match, or client IPs (throttling) will be wrong: too low and every visitor shares the proxy's IP (one rate-limit bucket for the whole site), too high and clients can spoof their IP via `X-Forwarded-For`. `TRUST_PROXY` also accepts comma-separated trusted CIDRs (e.g. the CDN's published ranges plus `172.16.0.0/12` for the Docker network) instead of a count.

After HTTPS works, check that `curl -sI https://sarv.example.ir | grep -i strict-transport` shows HSTS.

## 6. Updates and rollback

```bash
cd /opt/digital-sarv
# keep the current images as :prev for a quick rollback
docker tag digital-sarv/api:latest digital-sarv/api:prev
docker tag digital-sarv/web:latest digital-sarv/web:prev
./deploy/backup.sh                     # always back up before an update

git pull
dc up -d --build                       # rebuilds and replaces api/web; mongo/redis keep running
dc ps && curl -fsS http://localhost/api/health/ready
docker image prune -f
```

Rollback to the previous images, without rebuilding:

```bash
IMAGE_TAG=prev dc up -d --no-build api web
# then fix forward: git checkout <good-commit> && dc up -d --build
```

When a release changes data shape, restore the Mongo backup taken before the update (section 9).

## 7. Zarinpal

1. In the Zarinpal panel, create a terminal for the production domain. Zarinpal rejects callbacks whose domain differs from the registered one. Copy the 36-character **Merchant ID** into `ZARINPAL_MERCHANT_ID`.
2. Callback URL (the API sends it with every payment request; register or allow this domain in the terminal):
   ```
   ${API_PUBLIC_URL}/api/payments/zarinpal/callback      e.g. https://sarv.example.ir/api/payments/zarinpal/callback
   ```
   After verification, the API redirects the customer to `${WEB_PUBLIC_URL}/app/pay/return?order=…&status=ok|failed`.
3. Test first with `ZARINPAL_SANDBOX=1` (sandbox merchant ID), then switch to `0` and `dc up -d api`.
4. Keep `PAYMENT_DRIVER=zarinpal`. `mock` is refused in production, and `PAYMENT_ALLOW_MOCK` must never be set.

## 8. Kavenegar (SMS)

1. At panel.kavenegar.com, copy the **API key** into `SMS_API_KEY`. Under API settings, add the server's public IP to the allowed IPs if IP restriction is on.
2. Under **Verification → Templates (سرویس اعتبارسنجی)**, create an OTP template named like `SMS_OTP_TEMPLATE` (e.g. `sarv-otp`) with one token, for example:
   ```
   دیجیتال سرو
   کد ورود شما: %token
   ```
   Wait for approval before going live.
3. `SMS_SENDER` is the dedicated line number used for order notifications (the templates are edited in `/admin/` → notifications).
4. Check the flow: request an OTP at `/app/`, then check the SMS and `dc logs api`.

## 9. Backups and restore

`deploy/backup.sh` writes `backups/mongo-<stamp>.archive.gz` (mongodump, gzip) and `backups/uploads-<stamp>.tgz` (the `uploads` volume). It keeps 14 days (`KEEP_DAYS`).

```bash
chmod +x deploy/backup.sh
crontab -e
# 0 3 * * * cd /opt/digital-sarv && ./deploy/backup.sh >> /var/log/sarv-backup.log 2>&1
```

Copy `backups/` off the server every day (rclone to S3/ArvanCloud object storage, or rsync). A backup that only exists on the same disk is not a backup. Test a restore at least once.

Restore:

```bash
# Mongo (--drop replaces existing collections)
dc exec -T mongo sh -c 'mongorestore --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < backups/mongo-YYYYMMDD-HHMMSS.archive.gz

# uploads
dc stop api
docker run --rm -v digital-sarv-prod_uploads:/data -v "$PWD/backups:/backup" alpine:3 \
  sh -c 'rm -rf /data/* && tar xzf /backup/uploads-YYYYMMDD-HHMMSS.tgz -C /data && chown -R 1000:1000 /data'
dc start api
```

Redis holds only OTPs, cache and rate-limit counters. It does not need backups (AOF survives restarts).

## 10. Logs and health

```bash
dc ps                                   # health status per service
dc logs -f --tail=200 api               # or web / mongo / redis
docker inspect --format '{{json .State.Health}}' digital-sarv-prod-api-1 | jq
docker stats                            # CPU / memory
docker system df                        # disk usage (images, volumes)
```

Logs use the json-file driver, rotated at 10 MB × 5 files per container. For uptime monitoring, point an external checker at `https://<domain>/api/health/ready`, which returns 503 when Mongo or Redis is down, and at `https://<domain>/healthz` for nginx.

Health endpoints: `/healthz` (nginx), `/api/health` (API liveness, used by the container healthcheck), `/api/health/ready` (Mongo + Redis).

## 11. Security checklist

- [ ] `.env.production` is `chmod 600`, never committed (it is in `.gitignore`), and every secret is freshly generated (`openssl rand -hex …`).
- [ ] `NODE_ENV=production`. `OTP_DEV_CODE` and `PAYMENT_ALLOW_MOCK` are **unset**. `PAYMENT_DRIVER=zarinpal`, `SMS_DRIVER=kavenegar`, `ZARINPAL_SANDBOX=0`.
- [ ] Only `web` (or `caddy`) publishes ports. `dc ps` shows no `27017` or `6379` mapping. `ss -tlnp` shows only 22/80/443.
- [ ] With Caddy or a host proxy, `HTTP_PORT=127.0.0.1:8080`, not `8080` (Docker bypasses ufw).
- [ ] HTTPS works, HTTP redirects to HTTPS, and HSTS is present. `CORS_ORIGIN` lists only the real origin(s).
- [ ] `ADMIN_PHONES` contains only the owner's numbers. The demo seed accounts (`09120000000`, …) do not exist in production: only `seed-base` was run.
- [ ] The Zarinpal terminal domain matches `API_PUBLIC_URL`. The Kavenegar API key has an IP restriction.
- [ ] The nightly backup cron runs, off-site copies exist, and a restore has been tested.
- [ ] SSH uses keys only (`PasswordAuthentication no`), with `unattended-upgrades` enabled and fail2ban optional.
- [ ] `/admin/` and `/courier/` send `X-Robots-Tag: noindex`: `curl -sI https://<domain>/admin/ | grep -i robots`.
- [ ] Images are rebuilt monthly (`dc build --pull && dc up -d`) to pick up base-image security fixes.
- [ ] Optional hardening: create a least-privilege Mongo user for `digital_sarv` (`readWrite`) instead of using the root account in `MONGO_URI`.

## Reference: what nginx does (`deploy/nginx/default.conf`)

- `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable` (hashed files). `/icons/*` is cached for 7 days. HTML, `sw.js` and `*.webmanifest` get `no-cache`.
- SPA fallback per prefix: `/app/*` → `/app/index.html`, `/courier/*` → `/courier/index.html`, `/admin/*` → `/admin/index.html`, everything else → `/index.html`. `/app`, `/courier` and `/admin` redirect to the trailing-slash path.
- `/api/` is proxied to `api:3000`, resolved at request time through Docker DNS, so nginx starts and keeps serving the landing page even when the API is down. It uses `client_max_body_size 55m` and 120 s timeouts, and sets `X-Forwarded-For/Proto/Host`.
- Security headers come from `deploy/nginx/snippets/security-headers.conf`: CSP (self only, `data:`/`blob:` images, Google Maps frames), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, COOP, and conditional HSTS. The API's own headers come from helmet.
- gzip for text, JS, CSS, JSON, SVG and manifests. `server_tokens off`.
