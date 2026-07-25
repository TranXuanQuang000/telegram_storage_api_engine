import re
from typing import List, Optional
from bs4 import BeautifulSoup


class NovelTextCleaner:
    # DOM tags that should be completely removed
    UNWANTED_TAGS = {
        "script",
        "iframe",
        "style",
        "noscript",
        "header",
        "footer",
        "nav",
        "svg",
        "form",
        "button",
        "ins",
    }

    # Ad and noise CSS class substring patterns (case-insensitive)
    AD_CLASS_PATTERNS = [
        r"adsbygoogle",
        r"truyenfull-ad",
        r"quang-cao",
        r"goc-quang-cao",
        r"outbrain-widget",
        r"ad-container",
        r"advertisement",
        r"banner-ad",
        r"social-share",
        r"qc-container",
        r"quangcao",
        r"popup",
        r"pop-up",
        r"ads-holder",
        r"\bads\b",
    ]

    # Watermark text patterns (case-insensitive)
    WATERMARK_PATTERNS = [
        r"Chúc\s+bạn\s+có\s+những\s+giây\s+phút\s+vui\s+vẻ\s+khi\s+đọc\s+truyện\s+tại[^\n<]*",
        r"Bạn\s+đang\s+đọc\s+truyện\s+được\s+cập\s+nhật\s+tại[^\n<]*",
        r"Bạn\s+đang\s+đọc\s+truyện\s+tại[^\n<]*",
        r"Truyện\s+được\s+copy\s+tại[^\n<]*",
        r"Đọc\s+truyện\s+tại[^\n<]*",
        r"Nguồn:\s*(?:truyenfull|ln\.hako|metruyenchu|wikidich|truyenqq|tangthuvien|sangtacviet)[^\s\n<]*",
        r"(?:https?://)?(?:www\.)?(?:truyenfull\.(?:vn|com|io|net)|ln\.hako\.vn|metruyenchu\.(?:com|vn)|metruyenchuvn\.com|wikidich\.(?:vn|com)|tangthuvien\.vn)[^\s\n<]*",
        r"(?:truyenfull|ln\.hako|metruyenchu|metruyenchuvn|wikidich|tangthuvien)\.(?:vn|com|io|net)",
    ]

    def __init__(self):
        self.watermark_regexes = [
            re.compile(pattern, re.IGNORECASE) for pattern in self.WATERMARK_PATTERNS
        ]

    def clean(self, raw_content: str, as_html: bool = True) -> str:
        """
        Cleans novel text content.
        
        Args:
            raw_content: Raw HTML or text string.
            as_html: If True, wraps clean paragraphs in standardized <p> tags.
                     If False, returns paragraphs separated by double newlines.
        """
        if not raw_content or not raw_content.strip():
            return ""

        soup = BeautifulSoup(raw_content, "html.parser")

        # 1. Decompose unwanted tags
        for tag_name in self.UNWANTED_TAGS:
            for element in soup.find_all(tag_name):
                element.decompose()

        # 2. Decompose elements with hidden styles or ad CSS classes
        for element in list(soup.find_all(True)):
            if element.has_attr("hidden"):
                element.decompose()
                continue

            style = element.get("style", "")
            if isinstance(style, str) and style:
                style_clean = style.replace(" ", "").lower()
                if "display:none" in style_clean or "visibility:hidden" in style_clean:
                    element.decompose()
                    continue

            classes = element.get("class", [])
            if isinstance(classes, str):
                classes = classes.split()
            if any(self._is_ad_class(cls) for cls in classes):
                element.decompose()

        # 3. Extract and clean paragraphs
        paragraphs: List[str] = []

        # Replace <br> and <div> boundaries with newlines if needed
        for br in soup.find_all("br"):
            br.replace_with("\n")

        p_tags = soup.find_all("p")
        if p_tags:
            for p in p_tags:
                text = p.get_text(separator=" ", strip=True)
                cleaned_p = self._clean_text_string(text)
                if cleaned_p:
                    paragraphs.append(cleaned_p)
        else:
            full_text = soup.get_text(separator="\n", strip=True)
            lines = full_text.split("\n")
            for line in lines:
                cleaned_line = self._clean_text_string(line)
                if cleaned_line:
                    paragraphs.append(cleaned_line)

        # 4. Format output
        if as_html:
            return "\n".join(f"<p>{p}</p>" for p in paragraphs)
        else:
            return "\n\n".join(paragraphs)

    def _is_ad_class(self, class_name: str) -> bool:
        cls_lower = class_name.lower()
        for pattern in self.AD_CLASS_PATTERNS:
            if re.search(pattern, cls_lower, re.IGNORECASE):
                return True
        return False

    def _clean_text_string(self, text: str) -> str:
        if not text:
            return ""

        # Remove zero-width unicode spaces (\u200B, \uFEFF) & non-breaking spaces (\u00A0)
        cleaned = text.replace("\u200B", "").replace("\uFEFF", "").replace("\u00A0", " ")
        cleaned = re.sub(r"[\u200C\u200D\u200E\u200F]", "", cleaned)

        # Strip watermark patterns
        for wm_regex in self.watermark_regexes:
            cleaned = wm_regex.sub("", cleaned)

        # Collapse whitespace
        cleaned = re.sub(r"[ \t]+", " ", cleaned).strip()

        return cleaned
