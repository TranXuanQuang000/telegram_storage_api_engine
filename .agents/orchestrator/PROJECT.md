# Multi-Source Aggregator API System — PROJECT.md

## Objective
Build a complete Multi-Source Aggregator API System for both Comics and Novels in `d:/Code/Project/App Truyen Nova/backend_api_engine`.

## Requirements Breakdown
- **R1**: Multi-Source Connector Architecture (Comic: OTruyen API, MangaDex API, Custom HTML Scraper; Novel: Hako, TruyenFull, Metruyenchu).
- **R2**: Smart Chapter Merge & Gap Filling Engine (auto-merging, gap detection e.g. ch 10-20, alternate source fallback).
- **R3**: REST API Compatibility (OTruyen endpoints: `/v1/api/danh-sach/truyen-moi`, `/v1/api/truyen-tranh/{slug}`, `/v1/api/chapter/{id}`; Novel endpoints: `/v1/api/truyen-chu/danh-sach`, `/v1/api/truyen-chu/{slug}`, `/v1/api/truyen-chu/{slug}/chapter/{chapterNo}`; text cleaning for ads/garbage/scripts).
- **R4**: Automated Verification & Testing Suite (<1.5s latency, 100% ad removal, gap filling verification, 100% test pass rate).

## Milestones Table
| # | Milestone Name | Scope & Deliverables | Status |
|---|----------------|----------------------|--------|
| 1 | Architecture & Multi-Source Connectors | Plugin/connector framework, Comic sources (OTruyen, MangaDex, HTML Scraper), Novel sources (Hako, TruyenFull, Metruyenchu) | DONE |
| 2 | Smart Merge & Gap Filling Engine + Text Cleaner | Chapter normalization, deduplication, missing gap filling, novel text ad/garbage cleaner | DONE |
| 3 | REST API Compatibility Server | OTruyen standard endpoints + Novel extension endpoints, <1.5s latency performance tuning | DONE |
| 4 | Integration Testing & Forensic Audit | Automated test suite, E2E gap filling verification, latency & ad removal check, Forensic Auditor check | DONE |

## Code Layout
`d:/Code/Project/App Truyen Nova/backend_api_engine/`
├── app/
│   ├── main.py (FastAPI entrypoint)
│   ├── api/
│   │   ├── v1/
│   │   │   ├── otruyen.py (OTruyen standard endpoints)
│   │   │   └── novel.py (Novel API endpoints)
│   ├── connectors/
│   │   ├── base.py (Base Connector interface with retry backoff & URL cleaner)
│   │   ├── comic/
│   │   │   ├── otruyen.py
│   │   │   ├── mangadex.py
│   │   │   └── html_scraper.py
│   │   └── novel/
│   │       ├── hako.py
│   │       ├── truyenfull.py
│   │       └── metruyenchu.py
│   ├── engine/
│   │   ├── merger.py (Smart Chapter Merge & Gap Filling Engine)
│   │   └── cleaner.py (Novel Text Content Cleaning Engine)
│   ├── models/
│   │   ├── story.py
│   │   └── chapter.py
│   └── services/
│       └── aggregator.py (Aggregator Service & Caching layer)
├── tests/
│   ├── test_connectors.py
│   ├── test_merger.py
│   ├── test_cleaner.py
│   ├── test_api.py
│   └── test_empirical_m4.py
├── requirements.txt
└── README.md
