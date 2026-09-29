# DATALINK Regulatory Engine

Standalone regulatory-control layer for DATALINK V6.

## MVP
- Upload XLSX/CSV
- Detect likely NC column automatically
- Normalize NC codes
- Resolve the 4-digit NC position
- Apply Article 50 duodecies rules loaded from `rules/50_duodecies.csv`
- Return DIRECT / CONDITIONNEL / NON_COUVERT / INVALIDE
- Export XLSX

This service is intentionally isolated from the DATALINK matching engine and Splink.

## Run
```
docker compose -f regulatory-engine/docker-compose.yml up --build
```

API: `POST /api/analyze` with multipart field `file`.

The production legal rules file must be the validated 2026 source dataset; the application does not invent legal rules.
