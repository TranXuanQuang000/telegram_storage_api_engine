import pytest
from app.engine.cleaner import NovelTextCleaner


def test_cleaner_script_iframe_style_removal():
    cleaner = NovelTextCleaner()
    raw_html = """
    <div>
        <script>var x = "ad_script";</script>
        <style>.ad { color: red; }</style>
        <iframe>http://ad-iframe.com</iframe>
        <p>Nội dung đoạn 1 chính thức.</p>
    </div>
    """
    cleaned = cleaner.clean(raw_html, as_html=True)
    assert "<script>" not in cleaned
    assert "var x" not in cleaned
    assert "<style>" not in cleaned
    assert "<iframe>" not in cleaned
    assert "<p>Nội dung đoạn 1 chính thức.</p>" in cleaned


def test_cleaner_hidden_elements_and_ad_classes():
    cleaner = NovelTextCleaner()
    raw_html = """
    <div>
        <div class="adsbygoogle">Quảng cáo Google</div>
        <div class="truyenfull-ad">Quảng cáo Truyện Full</div>
        <span class="quang-cao">QC Hot</span>
        <div class="goc-quang-cao">Góc Quảng Cáo</div>
        <div class="outbrain-widget">Outbrain</div>
        <p style="display: none">Nội dung ẩn</p>
        <p style="visibility: hidden">Nội dung tàng hình</p>
        <p hidden>Nội dung hidden attr</p>
        <p>Đoạn văn hợp lệ.</p>
    </div>
    """
    cleaned = cleaner.clean(raw_html, as_html=True)
    assert "Quảng cáo Google" not in cleaned
    assert "Quảng cáo Truyện Full" not in cleaned
    assert "QC Hot" not in cleaned
    assert "Góc Quảng Cáo" not in cleaned
    assert "Outbrain" not in cleaned
    assert "Nội dung ẩn" not in cleaned
    assert "Nội dung tàng hình" not in cleaned
    assert "Nội dung hidden attr" not in cleaned
    assert "<p>Đoạn văn hợp lệ.</p>" in cleaned


def test_cleaner_watermark_removal():
    cleaner = NovelTextCleaner()
    raw_html = """
    <div>
        <p>Nguồn: truyenfull.vn</p>
        <p>Bạn đang đọc truyện tại truyenfull.vn</p>
        <p>Nguồn: ln.hako.vn - Truyện dịch hay</p>
        <p>Đọc truyện tại metruyenchu.com nhé các bạn!</p>
        <p>Bắt đầu nội dung truyện chính.</p>
    </div>
    """
    cleaned = cleaner.clean(raw_html, as_html=True)
    assert "Nguồn: truyenfull.vn" not in cleaned
    assert "Bạn đang đọc truyện tại" not in cleaned
    assert "metruyenchu.com" not in cleaned
    assert "<p>Bắt đầu nội dung truyện chính.</p>" in cleaned


def test_cleaner_zero_width_spaces():
    cleaner = NovelTextCleaner()
    raw_html = "<p>Nội\u200Bdung \uFEFFtruyện\u00A0sạch.</p>"
    cleaned = cleaner.clean(raw_html, as_html=True)
    assert "\u200B" not in cleaned
    assert "\uFEFF" not in cleaned
    assert "\u00A0" not in cleaned
    assert "<p>Nộidung truyện sạch.</p>" in cleaned


def test_cleaner_plain_text_mode():
    cleaner = NovelTextCleaner()
    raw_html = """
    <p>Đoạn thứ nhất.</p>
    <p>Đoạn thứ hai.</p>
    """
    cleaned_plain = cleaner.clean(raw_html, as_html=False)
    assert "<p>" not in cleaned_plain
    assert cleaned_plain == "Đoạn thứ nhất.\n\nĐoạn thứ hai."


def test_cleaner_watermark_order_no_fragment():
    cleaner = NovelTextCleaner()
    raw_html = "<p>Chúc bạn có những giây phút vui vẻ khi đọc truyện tại truyenfull.vn</p>"
    cleaned = cleaner.clean(raw_html, as_html=True)
    assert "Chúc bạn có những giây phút vui vẻ khi" not in cleaned
    assert cleaned == ""


def test_cleaner_ad_class_word_boundary():
    cleaner = NovelTextCleaner()
    raw_html = """
    <div>
        <div class="downloads">Link tải truyện</div>
        <div class="uploads">Quản lý upload</div>
        <div class="threads">Thảo luận truyện</div>
        <div class="spreads">Lan tỏa bài viết</div>
        <div class="ads">Quảng cáo thật</div>
    </div>
    """
    cleaned = cleaner.clean(raw_html, as_html=True)
    assert "<p>Link tải truyện</p>" in cleaned
    assert "<p>Quản lý upload</p>" in cleaned
    assert "<p>Thảo luận truyện</p>" in cleaned
    assert "<p>Lan tỏa bài viết</p>" in cleaned
    assert "Quảng cáo thật" not in cleaned


def test_cleaner_get_text_linebreaks():
    cleaner = NovelTextCleaner()
    raw_html = "<div>Đoạn một</div><div>Đoạn hai</div>"
    cleaned = cleaner.clean(raw_html, as_html=False)
    assert cleaned == "Đoạn một\n\nĐoạn hai"
