# System Design

## 1. Tech Stack
- **Frontend**: React (Next.js), React Flow (for Canvas), TailwindCSS.
- **Backend**: TypeScript (Node.js) or Python (FastAPI for data processing/scraping), RabbitMQ/Kafka for Queue.
- **Database**: PostgreSQL (Relational data), Redis (Caching/Rate Limiting, Circuit Breaker states).
- **Other**: Probabilistic Record Linkage (Splink/Dedupe).

## 2. DB Schema
- **Stories**: id, title, author, description, created_at
- **Chapters**: id, story_id, title, original_url, consent_status (enum: VERIFIED, FLAG, UNKNOWN), provenances (JSONB), created_at
- **Sources**: id, domain, is_whitelisted, robots_txt_rules (JSONB)
- **ScrapeMetrics**: id, source_id, success_count, fail_count, error_rate, timestamp

## 3. API Endpoints
- `GET /api/v1/stories`
- `GET /api/v1/stories/{id}/chapters`
- `GET /api/v1/admin/canvas-nodes`
- `POST /api/v1/admin/merge`
- `GET /api/v1/system/health`

## 4. Folder Structure
```
/frontend
  /src/components
  /src/pages
/backend
  /src/controllers
  /src/services
  /src/models
  /src/routes
  /src/pipelines
/shared_memory
```

## 5. DAG Dependencies
- `Scraping Job` -> `Consent Verification Layer` -> `Message Queue` -> `Record Linkage/Blocking` -> `Similarity (Jaccard/pHash)` -> `Database` -> `Admin Validation (Canvas)`.
