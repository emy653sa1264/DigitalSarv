#!/usr/bin/env sh
# Digital Sarv — nightly backup: MongoDB dump + uploads volume.
# Run from the repo root on the server (see docs/deploy.md, "Backups"):
#   0 3 * * * cd /opt/digital-sarv && ./deploy/backup.sh >> /var/log/sarv-backup.log 2>&1
set -eu

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
PROJECT=digital-sarv-prod
BACKUP_DIR=${BACKUP_DIR:-./backups}
KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"
BACKUP_DIR=$(cd "$BACKUP_DIR" && pwd)

echo "[$STAMP] mongodump"
# Credentials come from the mongo container's own environment (never on the host command line).
$COMPOSE exec -T mongo sh -c \
  'mongodump --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' \
  > "$BACKUP_DIR/mongo-$STAMP.archive.gz"

echo "[$STAMP] uploads volume"
docker run --rm \
  -v "${PROJECT}_uploads:/data:ro" \
  -v "$BACKUP_DIR:/backup" \
  alpine:3 tar czf "/backup/uploads-$STAMP.tgz" -C /data .

echo "[$STAMP] pruning backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -type f \( -name 'mongo-*.archive.gz' -o -name 'uploads-*.tgz' \) -mtime +"$KEEP_DAYS" -delete

ls -lh "$BACKUP_DIR" | tail -n 4
echo "[$STAMP] done — copy $BACKUP_DIR off the server (rclone/rsync/S3) as well"
