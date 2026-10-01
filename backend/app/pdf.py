from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, A5, letter
from reportlab.lib.utils import ImageReader
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


def _chrome(c: canvas.Canvas, title: str, page_no: int, pw: float, ph: float) -> None:
    c.setFillColor(BURGUNDY)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN, ph - MARGIN + 8, "LectureLeaf")
    c.setFillColor(GRAY)
    c.setFont("Helvetica", 8)
    c.drawRightString(pw - MARGIN, ph - MARGIN + 8, title[:70].encode("latin-1", "replace").decode("latin-1"))
    c.setStrokeColor(RULE)
    c.line(MARGIN, ph - MARGIN + 2, pw - MARGIN, ph - MARGIN + 2)
    c.drawCentredString(pw / 2, MARGIN - 14, str(page_no))


def build_pdf(out: str, title: str, frames: list[tuple[int, str]], s: Settings) -> None:
    """frames: (seconds, local image path) in lecture order."""
    pw, ph = PAGES.get(s.pdf_page_size, A4)
    c = canvas.Canvas(out, pagesize=(pw, ph))
    c.setTitle(title)
    inner_w, inner_h = pw - 2 * MARGIN, ph - 2 * MARGIN
    style = s.pdf_style
    per_page = {"minimal": 2, "lecture": 1, "revision": 4, "cornell": 1}.get(style, 1)
    pages = [frames[i:i + per_page] for i in range(0, len(frames), per_page)]

    for page_no, chunk in enumerate(pages, 1):
        _chrome(c, title, page_no, pw, ph)
        n0 = (page_no - 1) * per_page
        top = ph - MARGIN - 8

        if style == "minimal":
            slot = inner_h / 2
            for k, (sec, path) in enumerate(chunk):
                y = top - (k + 1) * slot + 24
                _fit(c, path, MARGIN, y, inner_w, slot - 40)
                if s.include_timestamps:
                    _badge(c, MARGIN, y - 18, _ts(sec))

        elif style == "revision":
            cw, ch = inner_w / 2 - 6, inner_h / 2 - 6
            for k, (sec, path) in enumerate(chunk):
                col, row = k % 2, k // 2
                x = MARGIN + col * (cw + 12)
                y = top - (row + 1) * (ch + 12) + 12
                _fit(c, path, x, y + 22, cw, ch - 22)
                c.setFillColor(TINT)
                c.setStrokeColor(GOLD)
                c.roundRect(x, y, cw, 18, 3, stroke=1, fill=1)
                c.setFillColor(BURGUNDY)
                c.setFont("Helvetica-Bold", 8)
                label = f"Key term {n0 + k + 1}" + (f"  -  {_ts(sec)}" if s.include_timestamps else "")
                c.drawString(x + 6, y + 6, label)

        elif style == "cornell":
            sec, path = chunk[0]
            cue_w = inner_w * 0.28
            summary_h = 90
            body_top = top - 6
            body_bottom = MARGIN + summary_h + 10
            c.setStrokeColor(BURGUNDY)
            c.line(MARGIN + cue_w, body_top, MARGIN + cue_w, body_bottom)
            c.setFillColor(GOLD)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(MARGIN, body_top - 10, "CUES")
            if s.include_timestamps:
                _badge(c, MARGIN, body_top - 34, _ts(sec))
            _rules(c, MARGIN, body_top - 60, cue_w - 10, int((body_top - body_bottom - 60) // 18))
            nx, nw = MARGIN + cue_w + 12, inner_w - cue_w - 12
            _, iy, _, _ = _fit(c, path, nx, body_top - 230, nw, 224)
            _rules(c, nx, iy - 18, nw, int((iy - body_bottom - 10) // 18))
            c.setFillColor(TINT)
            c.setStrokeColor(BURGUNDY)
            c.rect(MARGIN, MARGIN, inner_w, summary_h, stroke=1, fill=1)
            c.setFillColor(BURGUNDY)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(MARGIN + 8, MARGIN + summary_h - 14, "SUMMARY")

        else:  # lecture notes
            sec, path = chunk[0]
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 14)
            c.drawString(MARGIN, top - 22, f"Moment {n0 + 1}")
            if s.include_timestamps:
                _badge(c, pw - MARGIN - 48, top - 24, _ts(sec))
            img_h = inner_h * 0.5
            _, iy, _, _ = _fit(c, path, MARGIN, top - 34 - img_h, inner_w, img_h)
            c.setFillColor(BURGUNDY)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(MARGIN, iy - 20, "KEY POINTS")
            _rules(c, MARGIN, iy - 40, inner_w, int((iy - 40 - MARGIN) // 20), 20)

        c.showPage()
    c.save()
