from dataclasses import dataclass, field
from typing import Optional

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, A5, letter
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from .schemas import Settings

BURGUNDY = HexColor("#7A263A")
GOLD = HexColor("#C5A46D")
INK = HexColor("#151515")
GRAY = HexColor("#68645F")
RULE = HexColor("#E2DDD3")
TINT = HexColor("#F7EEEA")
WHITE = HexColor("#FFFDF9")
PAGES = {"A4": A4, "Letter": letter, "A5": A5}
MARGIN = 36

_PUNCT = {"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-",
          "…": "...", " ": " ", "•": "-", "→": "->"}


@dataclass
class PdfFrame:
    seconds: int
    path: str
    heading: str = ""
    key_points: list[str] = field(default_factory=list)
    note: str = ""


def clean(text: str) -> str:
    """The built-in PDF fonts only cover Latin-1, so map common punctuation and replace the rest."""
    for k, v in _PUNCT.items():
        text = text.replace(k, v)
    return text.encode("latin-1", "replace").decode("latin-1")


def _ts(seconds: int) -> str:
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def _fit(c: canvas.Canvas, path: str, x: float, y: float, w: float, h: float):
    """Draw the image inside the box (x, y = bottom-left), top-aligned, keeping its aspect ratio."""
    img = ImageReader(path)
    iw, ih = img.getSize()
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + h - dh
    c.drawImage(img, dx, dy, dw, dh)
    c.setStrokeColor(RULE)
    c.rect(dx, dy, dw, dh, stroke=1, fill=0)
    return dx, dy, dw, dh


def _badge(c: canvas.Canvas, x: float, y: float, text: str) -> None:
    c.setFillColor(BURGUNDY)
    c.roundRect(x, y, 48, 14, 3, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(x + 24, y + 4, text)


def _rules(c: canvas.Canvas, x: float, y_top: float, w: float, n: int, gap: float = 18) -> None:
    c.setStrokeColor(RULE)
    for i in range(max(n, 0)):
        c.line(x, y_top - i * gap, x + w, y_top - i * gap)


def _text(c: canvas.Canvas, text: str, x: float, y: float, w: float, font="Helvetica", size=10,
          color=INK, leading=None, max_lines: Optional[int] = None) -> float:
    """Draw wrapped text with its first baseline at y. Returns the y below the last line."""
    leading = leading or size * 1.35
    lines = simpleSplit(clean(text), font, size, w)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(" .,;") + "..."
    c.setFillColor(color)
    c.setFont(font, size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def _bullets(c: canvas.Canvas, points: list[str], x: float, y: float, w: float, size=10, min_y=0) -> float:
    for p in points:
        lines = simpleSplit(clean(p), "Helvetica", size, w - 12)
        if y - len(lines) * size * 1.35 < min_y:
            break
        c.setFillColor(BURGUNDY)
        c.circle(x + 3, y + size * 0.3, 1.6, stroke=0, fill=1)
        y = _text(c, p, x + 12, y, w - 12, size=size) - 3
    return y


def _one_line(text: str, font: str, size: float, width: float) -> str:
    text = clean(text)
    if stringWidth(text, font, size) <= width:
        return text
    while text and stringWidth(text + "...", font, size) > width:
        text = text[:-1]
    return text.rstrip() + "..."


def _chrome(c: canvas.Canvas, title: str, page_no: int, pw: float, ph: float) -> None:
    c.setFillColor(BURGUNDY)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN, ph - MARGIN + 8, "LectureLeaf")
    c.setFillColor(GRAY)
    c.setFont("Helvetica", 8)
    c.drawRightString(pw - MARGIN, ph - MARGIN + 8, _one_line(title, "Helvetica", 8, pw - 2 * MARGIN - 80))
    c.setStrokeColor(RULE)
    c.line(MARGIN, ph - MARGIN + 2, pw - MARGIN, ph - MARGIN + 2)
    c.drawCentredString(pw / 2, MARGIN - 14, str(page_no))


def _cover(c, title, frames, summary, duration_s, pw, ph, start_page: int) -> int:
    """Title page with summary and contents. Returns how many pages it used."""
    inner_w = pw - 2 * MARGIN
    pages_used, page_no = 0, start_page
    entries = [f for f in frames if f.heading]
    idx = 0
    while True:
        pages_used += 1
        _chrome(c, title, page_no, pw, ph)
        y = ph - MARGIN - 30
        if pages_used == 1:
            y = _text(c, title, MARGIN, y, inner_w, "Helvetica-Bold", 20, INK, max_lines=3) - 4
            meta = f"{len(frames)} key moments" + (f"  -  {max(1, round(duration_s / 60))} min lecture" if duration_s else "")
            y = _text(c, meta, MARGIN, y, inner_w, size=9, color=GRAY) - 14
            if summary:
                c.setFillColor(BURGUNDY); c.setFont("Helvetica-Bold", 9)
                c.drawString(MARGIN, y, "SUMMARY")
                y = _text(c, summary, MARGIN, y - 15, inner_w, size=10.5, leading=15) - 14
        if entries:
            c.setFillColor(BURGUNDY); c.setFont("Helvetica-Bold", 9)
            c.drawString(MARGIN, y, "CONTENTS")
            y -= 16
            while idx < len(entries) and y > MARGIN + 20:
                f = entries[idx]
                c.setFillColor(GOLD); c.setFont("Helvetica-Bold", 8.5)
                c.drawString(MARGIN, y, _ts(f.seconds))
                c.setFillColor(INK); c.setFont("Helvetica", 10)
                c.drawString(MARGIN + 50, y, _one_line(f.heading, "Helvetica", 10, inner_w - 50))
                y -= 16
                idx += 1
        c.showPage()
        page_no += 1
        if idx >= len(entries):
            return pages_used


def build_pdf(out: str, title: str, frames: list[PdfFrame], s: Settings,
              summary: str = "", duration_s: Optional[int] = None) -> None:
    pw, ph = PAGES.get(s.pdf_page_size, A4)
    c = canvas.Canvas(out, pagesize=(pw, ph))
    c.setTitle(clean(title))
    inner_w, inner_h = pw - 2 * MARGIN, ph - 2 * MARGIN
    style = s.pdf_style
    show_head = s.include_topic_headings
    show_points = s.generate_key_points
    per_page = {"minimal": 2, "lecture": 1, "revision": 4, "cornell": 1}.get(style, 1)

    page_no = 1
    if (summary or (show_head and any(f.heading for f in frames))) and s.detect_topics:
        page_no += _cover(c, title, frames if show_head else [], summary, duration_s, pw, ph, 1)

    pages = [frames[i:i + per_page] for i in range(0, len(frames), per_page)]
    for pi, chunk in enumerate(pages):
        _chrome(c, title, page_no, pw, ph)
        n0 = pi * per_page
        top = ph - MARGIN - 8

        if style == "minimal":
            slot = inner_h / 2
            for k, f in enumerate(chunk):
                y = top - (k + 1) * slot + 30
                _fit(c, f.path, MARGIN, y, inner_w, slot - 46)
                x = MARGIN
                if s.include_timestamps:
                    _badge(c, x, y - 20, _ts(f.seconds))
                    x += 56
                if show_head and f.heading:
                    c.setFillColor(INK); c.setFont("Helvetica-Bold", 10)
                    c.drawString(x, y - 16, _one_line(f.heading, "Helvetica-Bold", 10, inner_w - (x - MARGIN)))

        elif style == "revision":
            cw, ch = inner_w / 2 - 6, inner_h / 2 - 6
            for k, f in enumerate(chunk):
                col, row = k % 2, k // 2
                x = MARGIN + col * (cw + 12)
                y = top - (row + 1) * (ch + 12) + 12
                _fit(c, f.path, x, y + 24, cw, ch - 24)
                c.setFillColor(TINT); c.setStrokeColor(GOLD)
                c.roundRect(x, y, cw, 20, 3, stroke=1, fill=1)
                c.setFillColor(BURGUNDY); c.setFont("Helvetica-Bold", 8)
                stamp = f"  [{_ts(f.seconds)}]" if s.include_timestamps else ""
                label = (f.heading if show_head and f.heading else f"Key term {n0 + k + 1}")
                c.drawString(x + 6, y + 7, _one_line(label, "Helvetica-Bold", 8, cw - 12 - stringWidth(stamp, "Helvetica-Bold", 8)) + stamp)

        elif style == "cornell":
            f = chunk[0]
            cue_w = inner_w * 0.28
            summary_h = 80
            body_top = top - 6
            body_bottom = MARGIN + summary_h + 10
            c.setStrokeColor(BURGUNDY)
            c.line(MARGIN + cue_w, body_top, MARGIN + cue_w, body_bottom)
            c.setFillColor(GOLD); c.setFont("Helvetica-Bold", 8)
            c.drawString(MARGIN, body_top - 10, "CUES")
            y = body_top - 26
            if s.include_timestamps:
                _badge(c, MARGIN, y - 4, _ts(f.seconds))
                y -= 22
            if show_head and f.heading:
                y = _text(c, f.heading, MARGIN, y - 4, cue_w - 12, "Helvetica-Bold", 9, BURGUNDY, max_lines=6) - 4
            _rules(c, MARGIN, y - 10, cue_w - 10, int((y - 10 - body_bottom) // 18))
            nx, nw = MARGIN + cue_w + 12, inner_w - cue_w - 12
            _, iy, _, _ = _fit(c, f.path, nx, body_top - 220, nw, 214)
            y = iy - 16
            if show_points and f.key_points:
                y = _bullets(c, f.key_points, nx, y, nw, size=9.5, min_y=body_bottom + 20)
            _rules(c, nx, y - 6, nw, int((y - 6 - body_bottom) // 18))
            c.setFillColor(TINT); c.setStrokeColor(BURGUNDY)
            c.rect(MARGIN, MARGIN, inner_w, summary_h, stroke=1, fill=1)
            c.setFillColor(BURGUNDY); c.setFont("Helvetica-Bold", 8)
            c.drawString(MARGIN + 8, MARGIN + summary_h - 14, "SUMMARY")

        else:  # lecture notes
            f = chunk[0]
            has_points = show_points and bool(f.key_points)
            title_w = inner_w - (56 if s.include_timestamps else 0)
            head = f.heading if show_head and f.heading else f"Moment {n0 + 1}"
            y = _text(c, head, MARGIN, top - 18, title_w, "Helvetica-Bold", 14, INK, max_lines=2)
            if s.include_timestamps:
                _badge(c, pw - MARGIN - 48, top - 20, _ts(f.seconds))
            img_h = inner_h * (0.42 if has_points else 0.5)
            _, iy, _, _ = _fit(c, f.path, MARGIN, y - 4 - img_h, inner_w, img_h)
            y = iy - 22
            c.setFillColor(BURGUNDY); c.setFont("Helvetica-Bold", 9)
            c.drawString(MARGIN, y, "KEY POINTS")
            y -= 18
            if has_points:
                y = _bullets(c, f.key_points, MARGIN, y, inner_w, size=10.5, min_y=MARGIN + 30)
            if f.note:
                y = _text(c, "My note: " + f.note, MARGIN, y - 4, inner_w, "Helvetica-Oblique", 10, GRAY,
                          max_lines=4) - 4
            _rules(c, MARGIN, y - 6, inner_w, int((y - 6 - MARGIN) // 20), 20)

        c.showPage()
        page_no += 1
    c.save()
