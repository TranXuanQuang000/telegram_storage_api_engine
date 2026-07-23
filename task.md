project: muc
version: 1
tasks:
  - task_id: foundation
    agent: product_architect
    description: Lock PRD, system design, UI direction, tokens and API contract
    inputs: [STRATEGY_BLUEPRINT.md, UI_RESEARCH.md]
    outputs: [PRD.md, System_Design.md, UI_DIRECTION.md, shared_memory/design-tokens.json, shared_memory/api-contract.yaml]
    deps: []
  - task_id: vertical_slice
    agent: frontend_engineer
    description: Build shell, personalized home, story detail and immersive reader with realistic data
    inputs: [PRD.md, UI_DIRECTION.md, shared_memory/design-tokens.json]
    outputs: [app, components, frontend_progress.md]
    deps: [foundation]
  - task_id: data_core
    agent: backend_engineer
    description: Build D1 schema, catalog/progress/library APIs and rating/recommendation pure functions
    inputs: [System_Design.md, shared_memory/api-contract.yaml]
    outputs: [db/schema.ts, app/api, lib, backend_progress.md]
    deps: [foundation]
  - task_id: offline
    agent: frontend_engineer
    description: Add PWA manifest, service worker, download manager and offline reader
    inputs: [vertical_slice, data_core]
    outputs: [public/sw.js, download UI]
    deps: [vertical_slice, data_core]
  - task_id: ingestion_ai
    agent: backend_engineer
    description: Add source registry/connectors, protected incremental ingest and BYOK AI proxy
    inputs: [data_core]
    outputs: [lib/sources, app/api/admin/ingest, app/api/ai/recommend]
    deps: [data_core]
  - task_id: quality
    agent: qa_devops
    description: Run logic, security, performance and visual/accessibility gates
    inputs: [vertical_slice, offline, ingestion_ai]
    outputs: [test_report.md, deployment_ready.md, screenshots]
    deps: [vertical_slice, offline, ingestion_ai]

