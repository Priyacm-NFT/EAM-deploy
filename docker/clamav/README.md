# ClamAV

Virus scanning daemon for the attachment pipeline.

## Local dev

ClamAV is included in `docker/docker-compose.dev.yml` on port **3310**.

```bash
docker compose -f docker/docker-compose.dev.yml up -d clamav
```

Set in `.env`:

```
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
```

The worker scans uploads via the ClamAV **INSTREAM** protocol (`zINSTREAM` over TCP). Set `CLAMAV_DISABLED=true` only for unit tests or when the daemon is intentionally offline (falls back to EICAR string detection).

## Verify

```bash
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' | clamdscan -
```
