# Product Requirements Document (PRD)
## App Truyen Nova (Compliance-First Server-Side Aggregator)

### 1. Product Vision & Strategy
Hệ thống Aggregator tập trung, tối ưu về Đạo đức Dữ liệu (Ethical Data) và Minh bạch cho End-User, cung cấp công cụ mạnh mẽ trực quan cho Curator/Admin và công cụ giám sát thời gian thực cho DevOps.

### 2. User Roles & Stories
1. **Ethical Readers (End-user)**
   - As a reader, I want to see a "Consent Badge" on each chapter so that I know the content is legally aggregated.
   - As a reader, I want to click the badge to see the "Provenance" (Chứng thư nguồn gốc) so I can trust the platform.
2. **Data Curators/Admins (Admin)**
   - As an admin, I want to use an Infinite Canvas (React Flow) to drag-and-drop and visually merge story/chapter nodes.
   - As an admin, I want the system to alert me of "gaps" in the manga chapters so that I can fill them manually.
3. **DevOps/System Admins**
   - As a DevOps engineer, I want a Cyber-Nexus Dashboard with real-time particle streams so I can monitor scraping pipelines.
   - As a DevOps engineer, I want the system to auto-trip circuit breakers when error rate >20%/min and show red alerts so I can change proxy pools.

### 3. Acceptance Criteria
- **Smart Story/Chapter Merge**: Must utilize Probabilistic Record Linkage (Blocking, Jaccard/pHash) to identify duplicates. Canvas UI must render node streams without lagging (virtualization required).
- **Consent Verification**: Must verify through 4 layers (Robots.txt, Domain Whitelist, Opt-in Headers, TOS Keyword Scanner). Consent Badge must be displayed on reader UI.
- **Resiliency**: Adaptive Rate Limiting + Jitter + Exponential Backoff. Circuit breaker triggers at >20% error rate per minute.
