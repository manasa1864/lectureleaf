"""Reading text off video frames (RapidOCR, runs locally on CPU).

Two engines: a cheap detection-only one that measures how much text a frame has (used to compare
candidate frames), and a full one that actually reads it (used on the frames we keep).
OCR is optional: without the library everything still works, just without text-aware selection."""
import logging
import re
import threading

import cv2
import numpy as np

log = logging.getLogger("lectureleaf.ocr")
logging.getLogger("RapidOCR").setLevel(logging.ERROR)

MAX_WIDTH = 960
MIN_CONFIDENCE = 0.6

_lock = threading.Lock()  # engines are shared between jobs, so use them one at a time
_det = _full = None
_failed = False


def _engines():
    global _det, _full, _failed
    if _failed:
        return None, None
    if _det is None:
        try:
            from rapidocr import RapidOCR

            _det = RapidOCR(params={"Global.use_rec": False, "Global.use_cls": False})
            _full = RapidOCR(params={"Global.use_cls": False})
            logging.getLogger("RapidOCR").setLevel(logging.ERROR)
        except Exception as exc:  # not installed, or models missing
            _failed = True
            log.warning("OCR unavailable (%s): frames will be chosen without reading their text", exc)
            return None, None
    return _det, _full


def available() -> bool:
    with _lock:
        return _engines()[0] is not None


def _prep(frame: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]
    if w <= MAX_WIDTH:
        return frame
    return cv2.resize(frame, (MAX_WIDTH, int(h * MAX_WIDTH / w)), interpolation=cv2.INTER_AREA)


def text_area(frame: np.ndarray) -> float:
    """Fraction of the frame covered by text (0..1). Fast: detection only."""
    with _lock:
        det, _ = _engines()
        if det is None:
            return 0.0
        img = _prep(frame)
        try:
            res = det(img)
        except Exception:
            log.exception("OCR detection failed")
            return 0.0
    boxes = getattr(res, "boxes", None)
    if boxes is None or len(boxes) == 0:
        return 0.0
    h, w = img.shape[:2]
    area = sum(cv2.contourArea(np.asarray(b, dtype=np.float32)) for b in boxes)
    return float(min(area / (h * w), 1.0))


def read(frame: np.ndarray) -> tuple[str, float]:
    """(text, share of the frame covered by text). Text has one line per region, top to bottom."""
    with _lock:
        _, full = _engines()
        if full is None:
            return "", 0.0
        img = _prep(frame)
        try:
            res = full(img)
        except Exception:
            log.exception("OCR failed")
            return "", 0.0
    txts, scores, boxes = getattr(res, "txts", None), getattr(res, "scores", None), getattr(res, "boxes", None)
    if not txts:
        return "", 0.0
    h, w = img.shape[:2]
    keep = [i for i, sc in enumerate(scores) if sc >= MIN_CONFIDENCE and txts[i].strip()]
    area = sum(cv2.contourArea(np.asarray(boxes[i], dtype=np.float32)) for i in keep) / (h * w) if keep else 0.0
    return "\n".join(txts[i] for i in keep), float(min(area, 1.0))


def tokens(text: str) -> set[str]:
    """Normalized words used to decide whether two frames show the same content."""
    return set(re.findall(r"[a-z0-9]{3,}", text.lower()))
