# Comprehensive Design & Specification: Smart Chapter Merge & Gap Filling Engine (R2) and Novel Text Content Cleaner (R3)

**Author**: Explorer 3 (Milestone 1)  
**Target Code Location**: `backend_api_engine/app/engine/`  
**Files Specified**: `merger.py` (Chapter Merge & Gap Filling) & `cleaner.py` (Novel Text Content Cleaner)  
**Date**: 2026-07-26  

---

## 1. Executive Summary

This specification defines the architecture, data models, algorithms, and regex specifications for two core engines of the **Multi-Source Aggregator API System**:
1. **Smart Chapter Merge & Gap Filling Engine (`merger.py`)** [Requirement R2]: Normalizes chapter identifiers across diverse sources (e.g. OTruyen, MangaDex, Hako, TruyenFull, Metruyenchu), detects continuity gaps in primary chapter lists, fills missing ranges from secondary sources, and outputs a sorted, deduplicated chapter list with complete provenance metadata.
2. **Novel Text Content Cleaner (`cleaner.py`)** [Requirement R3]: Sanitizes raw scraped HTML/text content by removing ads, hidden scripts/iframes, watermark text, noise CSS classes, zero-width obfuscation characters, and site promotional spam to deliver clean, standard reader payloads.

---

## 2. Smart Chapter Merge & Gap Filling Engine Specification (`merger.py`)

### 2.1 Data Models & Schemas

```python
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class NormalizedChapterKey:
    volume_number: float = 0.0
    chapter_number: float = 0.0
    is_extra: bool = False
    extra_identifier: str = ""

    def __hash__(self):
        return hash((self.volume_number, self.chapter_number, self.is_extra, self.extra_identifier))

    def __eq__(self, other):
        if not isinstance(other, NormalizedChapterKey):
            return False
        return (self.volume_number == other.volume_number and 
                self.chapter_number == other.chapter_number and 
                self.is_extra == other.is_extra and 
                self.extra_identifier == other.extra_identifier)

@dataclass
class ChapterItem:
    id: str                                  # Source specific chapter ID or slug
    title: str                               # Clean chapter title
    raw_number_str: str                      # Original raw title e.g. "Vol 1 - Chương 10.5: Trận đấu"
    normalized_key: NormalizedChapterKey    # Structured normalized representation
    chapter_float: float                     # Primary floating-point index for sorting (e.g. 10.5)
    source_id: str                           # Origin source slug e.g. "otruyen", "truyenfull"
    source_name: str                         # Human-readable source name e.g. "Truyện Full"
    url: str                                 # Direct link to chapter
    updated_at: Optional[str] = None         # Release date string
    is_filled: bool = False                  # True if chapter was added via gap filling
    provenance: Dict[str, Any] = field(default_factory=dict) # Source lineage tracking
```

---

### 2.2 Chapter Number Parsing & Normalization Algorithm

#### 2.2.1 Problem Statement & Edge Cases
Chapter titles across Asian web novel/comic platforms exhibit wide variations:
- Standard integer: `"Chương 10"`, `"Chapter 10"`, `"10"`
- Fractional / Sub-chapters: `"Chương 10.5"`, `"Chap 10a"`, `"Chapter 10 - Phần 2"`
- Volume + Chapter: `"Vol 1 Chap 10"`, `"Volume 2 - Chương 15"`, `"Hồi 1 - Chương 5"`
- Titled chapter: `"Chương 100: Trận Đại Chiến Kết Thúc"`
- Extra / Side stories: `"Ngoại truyện 1"`, `"Side Story 2"`, `"Extra 0.5"`

#### 2.2.2 Algorithmic Pipeline (`parse_chapter_number`)

```python
import re
import unicodedata

class ChapterParser:
    # Pre-compiled regex patterns in priority order
    
    # Volume + Chapter pattern (e.g., "Vol 1 Chap 10", "Volume 2 - Chương 10.5")
    VOL_CHAP_PATTERN = re.compile(
        r'(?:Vol(?:ume|\.)?\s*(\d+(?:\.\d+)?))\s*[-:_|,]?\s*(?:Chương|Chap(?:ter)?|Ch\.?)\s*(\d+(?:\.\d+)?)',
        re.IGNORECASE
    )
    
    # Hồi / Tập + Chapter pattern (e.g., "Hồi 1 - Chương 5", "Tập 2 Chương 10")
    HOI_CHAP_PATTERN = re.compile(
        r'(?:Hồi|Tập)\s*(\d+(?:\.\d+)?)\s*[-:_|,]?\s*(?:Chương|Chap(?:ter)?|Ch\.?)\s*(\d+(?:\.\d+)?)',
        re.IGNORECASE
    )
    
    # Standard Chapter pattern (e.g., "Chương 10", "Chapter 10.5", "Chap. 12")
    STANDARD_CHAP_PATTERN = re.compile(
        r'(?:Chương|Chap(?:ter)?|Ch\.?)\s*(\d+(?:\.\d+)?)',
        re.IGNORECASE
    )
    
    # Extra / Ngoại truyện pattern (e.g., "Ngoại truyện 1", "Extra 2")
    EXTRA_PATTERN = re.compile(
        r'(?:Ngoại\s*truyện|Extra|Side\s*Story)\s*(\d+(?:\.\d+)?)?',
        re.IGNORECASE
    )
    
    # Alphabetic suffix pattern (e.g., "10a" -> 10.1, "10b" -> 10.2)
    SUFFIX_ALPHA_PATTERN = re.compile(
        r'(?:Chương|Chap(?:ter)?|Ch\.?)\s*(\d+)([a-z])\b',
        re.IGNORECASE
    )
    
    # Standalone number pattern at start of title (e.g., "10. Trận đánh")
    STANDALONE_NUM_PATTERN = re.compile(
        r'^\s*(\d+(?:\.\d+)?)\b',
        re.IGNORECASE
    )

    @classmethod
    def normalize(cls, raw_title: str) -> Tuple[NormalizedChapterKey, str]:
        """
        Parses a raw chapter string into a NormalizedChapterKey and clean title.
        """
        if not raw_title:
            return NormalizedChapterKey(0.0, 0.0, False, ""), ""

        # Step 1: Unicode Normalization (NFC) & Trim
        title = unicodedata.normalize('NFC', raw_title.strip())

        volume_num = 0.0
        chapter_num = 0.0
        is_extra = False
        extra_id = ""

        # Step 2: Check for Extra / Ngoại truyện
        extra_match = cls.EXTRA_PATTERN.search(title)
        if extra_match:
            is_extra = True
            extra_num_str = extra_match.group(1)
            chapter_num = float(extra_num_str) if extra_num_str else 1.0
            extra_id = extra_match.group(0).lower()
            key = NormalizedChapterKey(volume_num, chapter_num, is_extra, extra_id)
            return key, title

        # Step 3: Alphabetic suffix check (e.g., "Chương 10a")
        suffix_match = cls.SUFFIX_ALPHA_PATTERN.search(title)
        if suffix_match:
            base_ch = float(suffix_match.group(1))
            letter = suffix_match.group(2).lower()
            offset = (ord(letter) - ord('a') + 1) * 0.1  # 'a'->0.1, 'b'->0.2
            chapter_num = round(base_ch + offset, 2)
            key = NormalizedChapterKey(volume_num, chapter_num, False, "")
            return key, title

        # Step 4: Volume + Chapter match
        vol_chap_match = cls.VOL_CHAP_PATTERN.search(title)
        if vol_chap_match:
            volume_num = float(vol_chap_match.group(1))
            chapter_num = float(vol_chap_match.group(2))
            key = NormalizedChapterKey(volume_num, chapter_num, False, "")
            return key, title

        # Step 5: Hồi/Tập + Chapter match
        hoi_chap_match = cls.HOI_CHAP_PATTERN.search(title)
        if hoi_chap_match:
            volume_num = float(hoi_chap_match.group(1))
            chapter_num = float(hoi_chap_match.group(2))
            key = NormalizedChapterKey(volume_num, chapter_num, False, "")
            return key, title

        # Step 6: Standard Chapter match
        std_chap_match = cls.STANDARD_CHAP_PATTERN.search(title)
        if std_chap_match:
            chapter_num = float(std_chap_match.group(1))
            key = NormalizedChapterKey(volume_num, chapter_num, False, "")
            return key, title

        # Step 7: Fallback to Standalone Number at start
        standalone_match = cls.STANDALONE_NUM_PATTERN.search(title)
        if standalone_match:
            chapter_num = float(standalone_match.group(1))
            key = NormalizedChapterKey(volume_num, chapter_num, False, "")
            return key, title

        # Fallback if no numbers detected
        return NormalizedChapterKey(0.0, 0.0, False, "unknown"), title
```

---

### 2.3 Gap Detection Algorithm

#### 2.3.1 Definition of a Gap
A continuity gap in a chapter sequence exists when two consecutive main-story integer chapters $C_i$ and $C_{i+1}$ satisfy:
$$\text{int}(C_{i+1}) - \text{int}(C_i) \ge 2$$
The missing integer range is defined as:
$$\text{Gap} = [\text{int}(C_i) + 1, \text{int}(C_{i+1}) - 1]$$

#### 2.3.2 Gap Detection Implementation (`detect_gaps`)

```python
@dataclass
class ChapterGap:
    start_missing: float  # Missing range start (inclusive)
    end_missing: float    # Missing range end (inclusive)
    prev_chapter: float   # Chapter before gap
    next_chapter: float   # Chapter after gap

class GapDetector:
    @staticmethod
    def detect_gaps(chapters: List[ChapterItem], expected_start: float = 1.0) -> List[ChapterGap]:
        """
        Detects missing chapter number ranges in a sorted chapter list.
        """
        if not chapters:
            return [ChapterGap(start_missing=expected_start, end_missing=float('inf'), prev_chapter=0.0, next_chapter=0.0)]

        # Filter main story chapters (exclude extras) and sort by normalized chapter float
        main_chapters = [c for c in chapters if not c.normalized_key.is_extra]
        main_chapters.sort(key=lambda c: c.chapter_float)

        gaps: List[ChapterGap] = []

        # Check lead-in gap (if list doesn't start at chapter 1)
        first_ch = main_chapters[0].chapter_float
        if int(first_ch) > expected_start:
            gaps.append(ChapterGap(
                start_missing=expected_start,
                end_missing=float(int(first_ch) - 1),
                prev_chapter=0.0,
                next_chapter=first_ch
            ))

        # Check internal gaps
        for i in range(len(main_chapters) - 1):
            curr_ch = main_chapters[i].chapter_float
            next_ch = main_chapters[i+1].chapter_float

            curr_int = int(curr_ch)
            next_int = int(next_ch)

            # If gap between integer chapter numbers >= 2
            if next_int - curr_int >= 2:
                gaps.append(ChapterGap(
                    start_missing=float(curr_int + 1),
                    end_missing=float(next_int - 1),
                    prev_chapter=curr_ch,
                    next_chapter=next_ch
                ))

        return gaps
```

---

### 2.4 Multi-Source Gap Filling & Seamless Merge Algorithm

#### 2.4.1 Workflow Logic
1. **Primary Initialization**: Accept primary source chapter list $L_P$. Build a lookup dict `merged_map` keyed by `(volume_number, chapter_number)`.
2. **Gap Detection**: Run `GapDetector.detect_gaps(L_P)` to obtain missing ranges $G = [g_1, g_2, \dots]$.
3. **Secondary Inspection**: For each secondary source chapter list $L_{S1}, L_{S2}, \dots$ (ordered by source trust priority):
   - Parse and normalize each chapter in secondary source.
   - For chapter $c \in L_{Sk}$:
     - If $c.chapter\_number$ falls within any missing gap range in $G$:
     - And `key` not already in `merged_map`:
     - Set `c.is_filled = True`
     - Attach `provenance = {"filled_from": c.source_id, "primary_source": primary_source_id}`
     - Insert $c$ into `merged_map`.
4. **Deduplication & Collision Resolution**:
   - Primary source entries ALWAYS take precedence over filled entries.
   - If two secondary sources supply the same missing chapter number, higher priority secondary source wins.
5. **Final Re-indexing & Sorting**:
   - Extract all chapters from `merged_map`.
   - Sort by `(volume_number, chapter_float, is_extra)`.

```python
class SmartChapterMerger:
    @staticmethod
    def merge_and_fill(
        primary_chapters: List[ChapterItem],
        secondary_sources: Dict[str, List[ChapterItem]], # key: source_id, value: list of chapters
        source_priority: List[str]                      # ordered list of secondary source_ids
    ) -> List[ChapterItem]:
        """
        Merges primary chapters with missing chapters filled from secondary sources.
        """
        # Step 1: Map primary chapters
        merged_map: Dict[Tuple[float, float, bool], ChapterItem] = {}
        for ch in primary_chapters:
            key = (ch.normalized_key.volume_number, ch.chapter_float, ch.normalized_key.is_extra)
            merged_map[key] = ch

        # Step 2: Detect Gaps in Primary
        gaps = GapDetector.detect_gaps(primary_chapters)
        if not gaps:
            # No gaps, return sorted primary
            return sorted(primary_chapters, key=lambda c: (c.normalized_key.volume_number, c.chapter_float))

        # Helper function to check if a number falls in any gap
        def is_in_gaps(ch_num: float) -> bool:
            for g in gaps:
                if g.start_missing <= ch_num <= g.end_missing:
                    return True
            return False

        # Step 3: Fill Gaps from Secondary Sources in Priority Order
        for sec_id in source_priority:
            sec_chapters = secondary_sources.get(sec_id, [])
            for sec_ch in sec_chapters:
                key = (sec_ch.normalized_key.volume_number, sec_ch.chapter_float, sec_ch.normalized_key.is_extra)
                
                # If chapter is in a missing gap AND not yet filled
                if key not in merged_map and is_in_gaps(sec_ch.chapter_float):
                    sec_ch.is_filled = True
                    sec_ch.provenance = {
                        "filled": True,
                        "original_source": sec_ch.source_id,
                        "merged_at": datetime.utcnow().isoformat() + "Z"
                    }
                    merged_map[key] = sec_ch

        # Step 4: Final Sort
        result = list(merged_map.values())
        result.sort(key=lambda c: (c.normalized_key.volume_number, c.chapter_float, c.normalized_key.is_extra))
        return result
```

---

## 3. Novel Text Content Cleaner Specification (`cleaner.py`)

### 3.1 Overview & Goals
Scraped novel chapters from web platforms (TruyenFull, Hako, Metruyenchu, etc.) contain significant noise:
- Executive tags (`<script>`, `<iframe>`, `<style>`, `<link>`, `<form>`, `<input>`)
- Ad elements (`.adsbygoogle`, `.truyenfull-ad`, `.nhac-nho`, `#banner-ad`)
- Injected watermarks (`"Bạn đang đọc truyện tại truyenfull.vn"`, `"Nguồn: metruyenchu"`)
- Hidden tracking pixels & invisible zero-width characters (`\u200B`, `\uFEFF`)
- Unformatted wrapper HTML tags (`<div class="chapter-c">`, `<span>`)

The **Novel Text Cleaner** applies DOM sanitization and regex pattern stripping to yield pure, clean reader HTML or plain text.

---

### 3.2 Specification of Cleaning Rules

#### Rule Category A: DOM Tag & Attribute Sanitization

1. **Tag Blacklist (Complete Removal)**:
   - `<script>`, `<noscript>`, `<style>`, `<iframe>`, `<embed>`, `<object>`, `<applet>`, `<canvas>`, `<svg>`, `<form>`, `<input>`, `<button>`, `<link>`, `<meta>`, `<header>`, `<footer>`, `<nav>`, `<aside>`.
2. **Hidden Element Removal**:
   - Elements with inline styles: `display:\s*none`, `visibility:\s*hidden`, `opacity:\s*0`, `font-size:\s*0px`, `height:\s*0px`, `width:\s*0px`, `position:\s*absolute;\s*left:\s*-9999px`.
   - Elements with event attributes: `onclick`, `onload`, `onerror`, `onmouseover`.
3. **Noise Selector Blacklist (Class / ID matching)**:
   - CSS Selectors:
     - `[class*="ad"]`, `[id*="ad"]`
     - `[class*="banner"]`, `[id*="banner"]`
     - `[class*="sponsor"]`, `[id*="sponsor"]`
     - `[class*="watermark"]`, `[id*="watermark"]`
     - `.adsbygoogle`, `.truyenfull-ad`, `.nhac-nho`, `.box-notice`, `.social-share`, `.plugin-comment`, `.reading-control`, `.btn-group`, `.nav-chapters`

#### Rule Category B: Injected Watermark & Ad Text Regex Patterns

Watermark regex patterns applied line-by-line (case-insensitive):

| # | Target Watermark Pattern | Regex Specification |
|---|-------------------------|----------------------|
| 1 | TruyenFull source tag | `r'(?i)^\s*Ngu[ôồ]n\s*:\s*truyenfull(?:\.vn)?\s*$'` |
| 2 | General source line | `r'(?i)^\s*(?:Ngu[ôồ]n|Source)\s*:\s*.*$'` |
| 3 | Site reading notice | `r'(?i)^.*b[ạa]n\s+đang\s+đ[ọo]c\s+truy[ệe]n\s+t[ạa]i.*$'` |
| 4 | Copy penalty line | `r'(?i)^.*truy[ệe]n\s+đ\u01b0[ợo]c\s+copy\s+t[ạa]i.*$'` |
| 5 | Login prompt banner | `r'(?i)^.*vui\s+l[òo]ng\s+đ\u0103ng\s+nh[ậa]p\s+đ[ểe]\s+xem.*$'` |
| 6 | Like/Share prompt | `r'(?i)^.*like\s+page\s+đ[ểe]\s+[ủu]ng\s+h[ộo].*$'` |
| 7 | App download promo | `r'(?i)^.*t[ảa]i\s+app\s+.*đ[ểe]\s+đ[ọo]c\s+ch\u01b0\u01a1ng\s+m[ớo]i.*$'` |
| 8 | Group invite link | `r'(?i)^.*tham\s+gia\s+nh[óo]m\s+(?:zalo\|telegram\|facebook).*$'` |
| 9 | Chapter update note | `r'(?i)^\s*\[\s*th[ôô]ng\s*b[áa]o\s*\].*$'` |

#### Rule Category C: Character Sanitization & Normalization

1. **Invisible Character Strip**:
   - Zero-Width Space (`\u200B`), Zero-Width Non-Joiner (`\u200C`), Zero-Width Joiner (`\u200D`), Byte Order Mark (`\uFEFF`), Soft Hyphen (`\u00AD`), Right-to-Left Mark (`\u200F`).
2. **Whitespace Normalization**:
   - Replace multiple consecutive empty lines (`\n\s*\n\s*\n+`) with double newline (`\n\n`).
   - Trim leading and trailing spaces per paragraph.

---

### 3.3 Novel Content Cleaner Implementation (`cleaner.py`)

```python
import re
import unicodedata
from bs4 import BeautifulSoup, Comment

class NovelTextCleaner:
    # Tags to completely remove along with content
    DISALLOWED_TAGS = {
        'script', 'style', 'iframe', 'noscript', 'embed', 'object', 
        'canvas', 'svg', 'form', 'input', 'button', 'link', 'meta',
        'header', 'footer', 'nav', 'aside', 'applet'
    }

    # Classes and IDs regex patterns for noise/ad containers
    NOISE_CONTAINER_REGEX = re.compile(
        r'(?:ad[s]?|banner|sponsor|watermark|truyenfull-ad|nhac-nho|social-share|plugin-comment|reading-control|nav-chapters)',
        re.IGNORECASE
    )

    # Inline style regex to detect hidden elements
    HIDDEN_STYLE_REGEX = re.compile(
        r'(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|font-size\s*:\s*0px|height\s*:\s*0px|position\s*:\s*absolute;\s*left\s*:\s*-9999px)',
        re.IGNORECASE
    )

    # Text watermarks regex list
    WATERMARK_PATTERNS = [
        re.compile(r'^\s*ngu[ôồ]n\s*:\s*truyenfull(?:\.vn)?\s*$', re.IGNORECASE),
        re.compile(r'^\s*(?:ngu[ôồ]n|source)\s*:\s*.*$', re.IGNORECASE),
        re.compile(r'^.*b[ạa]n\s+đang\s+đ[ọo]c\s+truy[ệe]n\s+t[ạa]i.*$', re.IGNORECASE),
        re.compile(r'^.*truy[ệe]n\s+đ\u01b0[ợo]c\s+copy\s+t[ạa]i.*$', re.IGNORECASE),
        re.compile(r'^.*vui\s+l[òo]ng\s+đ\u0103ng\s+nh[ậa]p\s+đ[ểe]\s+xem.*$', re.IGNORECASE),
        re.compile(r'^.*like\s+page\s+đ[ểe]\s+[ủu]ng\s+h[ộo].*$', re.IGNORECASE),
        re.compile(r'^.*t[ảa]i\s+app\s+.*đ[ểe]\s+đ[ọo]c\s+ch\u01b0\u01a1ng\s+m[ớo]i.*$', re.IGNORECASE),
        re.compile(r'^.*tham\s+gia\s+nh[óo]m\s+(?:zalo|telegram|facebook).*$', re.IGNORECASE),
        re.compile(r'^\s*\[\s*th[ôô]ng\s*b[áa]o\s*\].*$', re.IGNORECASE)
    ]

    # Invisible unicode characters
    INVISIBLE_CHARS_REGEX = re.compile(r'[\u200B-\u200D\uFEFF\u00AD\u200F]')

    @classmethod
    def clean_html(cls, raw_html: str) -> str:
        """
        Sanitizes raw HTML content into clean, formatted paragraph HTML (<p>...</p>).
        """
        if not raw_html:
            return ""

        # Step 1: Strip invisible unicode characters
        cleaned_str = cls.INVISIBLE_CHARS_REGEX.sub('', raw_html)

        # Step 2: Parse DOM using BeautifulSoup
        soup = BeautifulSoup(cleaned_str, 'html.parser')

        # Step 3: Remove HTML Comments
        for comment in soup.find_all(text=lambda text: isinstance(text, Comment)):
            comment.extract()

        # Step 4: Remove Disallowed Tags
        for tag in soup.find_all(cls.DISALLOWED_TAGS):
            tag.decompose()

        # Step 5: Remove Elements with Noise Classes/IDs or Hidden Inline Styles
        for element in soup.find_all(True):
            # Check class
            classes = " ".join(element.get('class', []))
            elem_id = element.get('id', '')
            style = element.get('style', '')

            if cls.NOISE_CONTAINER_REGEX.search(classes) or cls.NOISE_CONTAINER_REGEX.search(elem_id):
                element.decompose()
                continue

            if style and cls.HIDDEN_STYLE_REGEX.search(style):
                element.decompose()
                continue

        # Step 6: Process Text Lines & Watermarks
        cleaned_paragraphs = []
        
        # Extract text blocks or paragraph elements
        p_tags = soup.find_all(['p', 'div'])
        if p_tags:
            for p in p_tags:
                text = p.get_text().strip()
                if text and not cls._is_watermark(text):
                    cleaned_paragraphs.append(f"<p>{text}</p>")
        else:
            # Fallback for plain text separated by linebreaks
            lines = soup.get_text().splitlines()
            for line in lines:
                text = line.strip()
                if text and not cls._is_watermark(text):
                    cleaned_paragraphs.append(f"<p>{text}</p>")

        return "\n".join(cleaned_paragraphs)

    @classmethod
    def _is_watermark(cls, line_text: str) -> bool:
        """Checks if line text matches any ad watermark pattern."""
        for pattern in cls.WATERMARK_PATTERNS:
            if pattern.search(line_text):
                return True
        return False
```

---

## 4. Verification & Testing Matrix

To ensure 100% adherence to quality standards and requirement compliance:

| Requirement | Test Scenario | Expected Outcome |
|-------------|---------------|------------------|
| **R2 - Normalization** | Input `"Vol 2 - Chương 10.5: Trận Đấu"` | `volume_number=2.0`, `chapter_number=10.5` |
| **R2 - Normalization** | Input `"Chương 10a"` | `chapter_number=10.1` |
| **R2 - Gap Detection** | Primary source has ch `[1..9, 21..50]` | Detects missing gap `(10.0, 20.0)` |
| **R2 - Gap Filling** | Fill gap `10..20` from secondary source | Resulting list contains 1..50, ch 10..20 tagged `is_filled=True` |
| **R3 - Script Removal** | Input `<p>Text</p><script>alert(1)</script>` | Result `<p>Text</p>` |
| **R3 - Ad Class Removal** | Input `<div class="truyenfull-ad">Ad</div>` | Element completely decomposed |
| **R3 - Watermark Removal** | Input `"Nguồn: truyenfull.vn"` | Line completely removed |
| **R3 - Zero-Width Clean** | Input `"Chu\u200Bơng 1"` | Cleaned string `"Chương 1"` |

---

## 5. Next Steps for Implementation (Worker Tasks in Milestone 2)

1. Create `backend_api_engine/app/engine/merger.py` using the algorithms specified in Section 2.
2. Create `backend_api_engine/app/engine/cleaner.py` using the sanitization specs in Section 3.
3. Write unit test suite `backend_api_engine/tests/test_merger.py` and `backend_api_engine/tests/test_cleaner.py`.
