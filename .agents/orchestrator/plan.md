# Execution Plan — Multi-Source Aggregator API System

## Overview
This document outlines the step-by-step execution plan for building the Multi-Source Aggregator API system for Comic & Novel sources.

## Phase 1: Exploration & Setup (Milestone 1 Prep)
- Dispatch Explorers (`teamwork_preview_explorer`) to inspect environment, existing dependencies, network constraints, existing backend setup (if any), and sample API structures.
- Define architecture patterns for connectors, merge engine, and API routes.

## Phase 2: Milestone 1 — Multi-Source Connector Architecture
- Dispatch Worker (`teamwork_preview_worker`) to create `backend_api_engine` directory structure, dependencies, base connector interface, Comic connectors (OTruyen API, MangaDex API, Custom HTML Scraper), and Novel connectors (Hako, TruyenFull, Metruyenchu).
- Verify base connectors with unit tests.
- Dispatch Reviewer (`teamwork_preview_reviewer`) to verify code quality, structure, and interface compliance.

## Phase 3: Milestone 2 — Smart Merge & Gap Filling Engine + Text Cleaner
- Dispatch Worker (`teamwork_preview_worker`) to build:
  - Smart Chapter Merge & Gap Filling Engine (`engine/merger.py`) detecting missing chapter ranges (e.g. source A missing ch 10-20) and filling from alternate sources (e.g. source B).
  - Novel Text Content Cleaner (`engine/cleaner.py`) eliminating ads, garbage text, scripts, watermarks, and tracking pixels.
- Dispatch Reviewer (`teamwork_preview_reviewer`) and Challenger (`teamwork_preview_challenger`) to verify gap filling algorithms and text cleaning edge cases.

## Phase 4: Milestone 3 — REST API Compatibility Server
- Dispatch Worker (`teamwork_preview_worker`) to implement:
  - OTruyen standard API endpoints: `/v1/api/danh-sach/truyen-moi`, `/v1/api/truyen-tranh/{slug}`, `/v1/api/chapter/{id}`.
  - Novel API endpoints: `/v1/api/truyen-chu/danh-sach`, `/v1/api/truyen-chu/{slug}`, `/v1/api/truyen-chu/{slug}/chapter/{chapterNo}`.
  - Latency optimization (<1.5s per response).
- Dispatch Reviewer & Challenger to test endpoints, JSON format compliance, response times.

## Phase 5: Milestone 4 — Comprehensive Verification Suite & Forensic Integrity Audit
- Dispatch Worker (`teamwork_preview_worker`) to assemble complete automated integration test suite in `tests/`.
- Dispatch Challenger (`teamwork_preview_challenger`) to run performance stress tests (<1.5s latency check) and gap-filling verification.
- Dispatch Forensic Auditor (`teamwork_preview_auditor`) to perform integrity verification (ensure no hardcoded/mocked data cheating).
- Gate check & completion report.
