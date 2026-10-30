# VPS: що потрібно зробити руками після Етапу 1 аудиту

Код і Dockerfile вже змінені в гілці `fix/audit-stage-1`. Нижче те, що живе лише на VPS
(`/opt/plast-api/`) і не потрапляє в репозиторій. Порядок важливий: **спершу бекап**.

## 1. Бекап (аудит `perf.rt.no-backups`)

Нічний `pg_dump` з хоста, 14 днів зберігання. Контейнер Postgres у проєкті зветься `postgres`
(перевірте: `cd /opt/plast-api && docker compose ps`).

```bash
mkdir -p /opt/plast-api/backups
cat > /opt/plast-api/backup.sh <<'EOF'
#!/bin/sh
set -eu
cd /opt/plast-api
STAMP=$(date +%Y%m%d-%H%M%S)
OUT=/opt/plast-api/backups/plast-$STAMP.dump
# POSTGRES_USER/POSTGRES_DB перевірте у docker-compose.yml
docker compose exec -T postgres pg_dump -U plast -d plast -Fc > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
find /opt/plast-api/backups -name 'plast-*.dump' -mtime +14 -delete
EOF
chmod +x /opt/plast-api/backup.sh
/opt/plast-api/backup.sh && ls -lh /opt/plast-api/backups
( crontab -l 2>/dev/null; echo '15 3 * * * /opt/plast-api/backup.sh >> /opt/plast-api/backups/backup.log 2>&1' ) | crontab -
```

**Копія поза VPS** (бекап на тому ж диску не рятує від втрати сервера): налаштуйте `rclone`
на Google Drive або інше сховище і додайте в кінець `backup.sh`:
`rclone copy "$OUT" remote:plast-backups/`.

**Перед кожним деплоєм:** `/opt/plast-api/backup.sh`.

**Тест відновлення (раз на місяць)** на тимчасовій базі, не на проді:

```bash
docker compose exec -T postgres createdb -U plast restore_test
docker compose exec -T postgres pg_restore -U plast -d restore_test --no-owner < /opt/plast-api/backups/<файл>.dump
docker compose exec -T postgres psql -U plast -d restore_test -c 'select count(*) from "User"'
docker compose exec -T postgres dropdb -U plast restore_test
```

## 2. Пул з'єднань (аудит `perf.db.pool-config`)

У сервісі `api` у `docker-compose.yml` додайте параметри до `DATABASE_URL`:

```
?connection_limit=10&pool_timeout=20
```

Це при одному процесі API і `max_connections=100` у Postgres. Повільні запити (> 200 мс)
тепер пишуться в лог API як `Slow query`.

## 3. Compose для сервісу api (аудит `perf.rt.pid1-no-shutdown`, `perf.rt.health-no-db`)

```yaml
  api:
    restart: unless-stopped
    mem_limit: 768m
    stop_grace_period: 20s
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s
```

Ліміт купи Node встановлено в Dockerfile (`--max-old-space-size=384`); якщо збільшуєте
`mem_limit`, збільшіть і його. Зовнішній пробник (UptimeRobot або подібний) на
`https://plast-api.srv1440057.hstgr.cloud/health`: тепер він віддає 503, коли БД недоступна.

## 4. Деплой цієї гілки

```bash
/opt/plast-api/backup.sh
cd /opt/plast-api/repo && git pull
cd /opt/plast-api && docker compose up -d --build
```

Міграції (`prisma migrate deploy`) застосуються при старті: 15 індексів і нова таблиця
`AiUsageEvent`. Індекси створюються швидко на поточних обсягах. Після деплою лічильники
AI-квот починаються з нуля (історія раніше не зберігалась).
