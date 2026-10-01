"""Choosing the moments of a lecture video worth keeping.

1. Sample the video every couple of seconds.
2. Work out which parts of the picture are always moving (a presenter on camera, a webcam corner) and
   ignore them, so only changes to the actual content (slides, board, code) count.
3. Group samples into segments of unchanged content; probe extra where the picture jumps.
4. In each segment pick the best frame: settled (not mid-transition), sharp, and with the most text.
5. Merge duplicates: identical-looking frames, and frames whose text is contained in a more complete one
   (e.g. a slide that builds up bullet by bullet). Of any duplicates, keep the one with the most information.
If the content can't be told apart from motion (a pure live-action video), fall back to evenly spaced frames.
"""
import time
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from . import config, ocr
from .errors import UserError
from .schemas import Settings

SAMPLE_EVERY_S = 2.0
BIG_CHANGE = 0.15          # fraction of pixels; a change this big triggers a midpoint probe
SETTLED = 0.003            # consecutive samples differing less than this count as "not moving"
MAX_CANDIDATES = 3         # frames compared per segment
MANY_SEGMENTS = 150        # above this, compare fewer candidates per segment to bound the time
MIN_TOKENS_FOR_TEXT_MATCH = 8
BLOCK = 10                 # motion is measured on a grid of BLOCK x BLOCK pixel cells of the 160x90 signature
MOTION_RATE = 0.4          # a cell that changes in more than this share of sample steps is "always moving"
MAX_MASKED = 0.6           # if more than this share of the picture is always moving, masking is pointless
FALLBACK_FRAMES = 12


@dataclass
class Sample:
    t: float
    small: np.ndarray
    sharp: float


@dataclass
class Moment:
    t: float
    frame: np.ndarray
    small: np.ndarray
    sharp: float
    area: float = 0.0           # share of the frame covered by text
    text: str = ""
    chars: int = 0
    toks: set = field(default_factory=set)

    @property
    def info(self) -> float:
        """How much information the frame carries: characters read, else the text area as a proxy."""
        return self.chars + 400 * self.area if self.chars or self.text else 1000 * self.area


class Differ:
    """Fraction of pixels that changed noticeably, ignoring always-moving regions and sensor/compression noise."""

    def __init__(self, keep: Optional[np.ndarray] = None):
        self.keep = keep  # boolean pixel mask of the regions that count, or None for the whole frame

    def __call__(self, a: np.ndarray, b: np.ndarray) -> float:
        changed = np.abs(a - b) > 0.12
        return float(changed[self.keep].mean()) if self.keep is not None else float(changed.mean())


def _gray_small(frame: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.resize(gray, (160, 90), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0


def _sharpness(frame: np.ndarray) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (480, int(480 * gray.shape[0] / gray.shape[1])), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _usable(frame: np.ndarray, sharp: float, s: Settings) -> bool:
    if not s.skip_low_quality:
        return True
    return 15 < frame.mean() < 245 and sharp > 20


class Reader:
    def __init__(self, path: str):
        self.cap = cv2.VideoCapture(path)
        if not self.cap.isOpened():
            raise UserError("The downloaded video couldn't be opened.")

    def duration(self) -> float:
        fps = self.cap.get(cv2.CAP_PROP_FPS) or 25
        return (self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / fps

    def at(self, t: float):
        self.cap.set(cv2.CAP_PROP_POS_MSEC, max(t, 0) * 1000)
        ok, frame = self.cap.read()
        return frame if ok else None

    def close(self):
        self.cap.release()


# ───────────── 1. sampling ─────────────

def sample_video(rd: Reader, duration: float, progress) -> list[Sample]:
    samples: list[Sample] = []
    t = 0.0
    end = max(duration, SAMPLE_EVERY_S)
    while t < end:
        frame = rd.at(t)
        if frame is None:
            break
        samples.append(Sample(t, _gray_small(frame), _sharpness(frame)))
        progress(min(t / end, 1.0) * 0.4)
        t += SAMPLE_EVERY_S
    return samples


# ───────────── 2. motion mask ─────────────

def motion_differ(samples: list[Sample]) -> tuple[Differ, bool]:
    """Differ that ignores always-moving regions. Second value: False if too much of the picture moves."""
    if len(samples) < 6:
        return Differ(), True
    rows, cols = 90 // BLOCK, 160 // BLOCK
    rate = np.zeros((rows, cols), np.float32)
    for a, b in zip(samples, samples[1:]):
        ch = (np.abs(a.small - b.small) > 0.12).reshape(rows, BLOCK, cols, BLOCK).mean(axis=(1, 3))
        rate += ch > 0.1
    rate /= len(samples) - 1
    moving = (rate > MOTION_RATE).astype(np.uint8)
    moving = cv2.dilate(moving, np.ones((3, 3), np.uint8))  # presenters have edges: cover a cell around them
    if moving.mean() > MAX_MASKED:
        return Differ(), False
    if not moving.any():
        return Differ(), True
    keep = np.kron(1 - moving, np.ones((BLOCK, BLOCK), np.uint8)).astype(bool)
    return Differ(keep), True


def probe_fast_changes(rd: Reader, samples: list[Sample], diff: Differ, change_thr: float) -> list[Sample]:
    """A big jump may hide a slide that was on screen for less than one step: check the middle."""
    out: list[Sample] = []
    for prev, cur in zip(samples, samples[1:]):
        out.append(prev)
        if cur.t - prev.t >= 1.5 and diff(prev.small, cur.small) > BIG_CHANGE:
            mid_t = (prev.t + cur.t) / 2
            mid = rd.at(mid_t)
            if mid is not None:
                m = Sample(mid_t, _gray_small(mid), _sharpness(mid))
                if diff(prev.small, m.small) > change_thr and diff(m.small, cur.small) > change_thr:
                    out.append(m)
    if samples:
        out.append(samples[-1])
    return out


# ───────────── 3. segments ─────────────

def segment(samples: list[Sample], change_thr: float, diff: Differ) -> list[list[int]]:
    """Runs of consecutive samples whose content did not change."""
    segs: list[list[int]] = []
    for i, smp in enumerate(samples):
        if segs and diff(samples[i - 1].small, smp.small) <= change_thr:
            segs[-1].append(i)
        else:
            segs.append([i])
    return segs


def candidates(samples: list[Sample], seg: list[int], s: Settings, limit: int, diff: Differ) -> list[int]:
    """Which samples of a segment are worth looking at closely."""
    settled = [i for i in seg if i > 0 and diff(samples[i - 1].small, samples[i].small) < SETTLED]
    if not settled:
        if len(seg) == 1 and s.skip_transitions:
            return []                   # on screen for about one step: a transition, not content
        settled = [seg[-1]]             # slowly changing content (writing, animation): the end state
    picks = [max(settled, key=lambda i: samples[i].sharp)]       # sharpest (no motion blur)
    picks.append(settled[-1])                                    # most complete (content builds up over time)
    if len(settled) > 3:
        picks.append(settled[len(settled) // 2])
    out: list[int] = []
    for i in picks:
        # Frames that look the same only differ in sharpness, which is already decided: skip the extra work.
        if all(diff(samples[i].small, samples[j].small) > SETTLED for j in out):
            out.append(i)
    return out[:limit]


# ───────────── 4/5. choose + merge ─────────────

def _text_match(a: Moment, b: Moment, thr: float) -> bool:
    if len(a.toks) < MIN_TOKENS_FOR_TEXT_MATCH or len(b.toks) < MIN_TOKENS_FOR_TEXT_MATCH:
        return False
    return len(a.toks & b.toks) / min(len(a.toks), len(b.toks)) >= thr


def _merge(kept: list[Moment], new: Moment, same) -> None:
    """Add `new` unless a kept moment duplicates it; of two duplicates keep the more informative one."""
    for k, old in enumerate(kept):
        if same(old, new):
            if new.info > old.info:
                kept[k] = new
            return
    kept.append(new)


def _make_moment(smp: Sample, frame: np.ndarray, has_ocr: bool) -> Moment:
    m = Moment(smp.t, frame, smp.small, smp.sharp)
    if has_ocr:
        m.text, m.area = ocr.read(frame)
        m.chars = len(m.text.replace("\n", ""))
        m.toks = ocr.tokens(m.text)
    return m


def _fallback_moments(rd: Reader, samples: list[Sample], s: Settings, has_ocr: bool) -> list[Moment]:
    """Evenly spaced frames, for videos where content can't be separated from motion."""
    if not samples:
        return []
    n = min(FALLBACK_FRAMES, len(samples))
    picks = sorted({int(round(i)) for i in np.linspace(0, len(samples) - 1, n)})
    out: list[Moment] = []
    for i in picks:
        frame = rd.at(samples[i].t)
        if frame is not None:
            out.append(_make_moment(samples[i], frame, has_ocr))
    if s.skip_low_quality:  # prefer sharp frames, but never end up with nothing
        good = [m for m in out if _usable(m.frame, m.sharp, s)]
        out = good or out
    return out


def detect_moments(video: str, duration: float, s: Settings, on_progress) -> list[Moment]:
    rd = Reader(video)
    try:
        duration = duration or rd.duration()
        change_thr = max(0.02 - 0.0002 * s.sensitivity, 0.004)  # more sensitive -> smaller change counts
        dupe_thr = 0.00006 * s.dupe_sensitivity                  # stricter -> wider "same as before" band
        text_thr = 0.75 + 0.2 * (s.dupe_sensitivity - 50) / 49    # stricter -> text may differ more
        has_ocr = ocr.available()
        ocr_deadline = time.time() + config.OCR_BUDGET_S  # handwriting can make OCR slow: stop reading when spent

        samples = sample_video(rd, duration, on_progress)
        if not samples:
            raise UserError("No frames could be read from this video.")
        diff, separable = motion_differ(samples)
        moments: list[Moment] = []

        if separable:
            samples = probe_fast_changes(rd, samples, diff, change_thr)
            segs = segment(samples, change_thr, diff)
            limit = 1 if len(segs) > MANY_SEGMENTS else MAX_CANDIDATES

            # Per segment, keep the candidate frame with the most text (then the sharpest), and read it once.
            for n, seg in enumerate(segs):
                options = []
                for i in candidates(samples, seg, s, limit, diff):
                    frame = rd.at(samples[i].t)
                    if frame is not None and _usable(frame, samples[i].sharp, s):
                        options.append((i, frame))
                use_ocr = has_ocr and time.time() < ocr_deadline
                if use_ocr and len(options) > 1:  # several different-looking candidates: cheap text check first
                    options = [max(options, key=lambda o: (ocr.text_area(o[1]), samples[o[0]].sharp))]
                if options:
                    i, frame = options[0]
                    moments.append(_make_moment(samples[i], frame, use_ocr))
                on_progress(0.4 + 0.6 * (n + 1) / len(segs))

        if not moments:  # nothing stood out (or the video is all motion): sample evenly instead
            moments = _fallback_moments(rd, samples, s, has_ocr)
            on_progress(1.0)
        if not moments:
            raise UserError("No usable frames were found in this video.")

        if s.remove_dupes:
            kept: list[Moment] = []
            for m in moments:  # identical-looking frames anywhere in the video
                _merge(kept, m, lambda a, b: diff(a.small, b.small) < dupe_thr)
            if has_ocr:        # and frames whose text is contained in a more complete one
                moments, kept = kept, []
                for m in moments:
                    _merge(kept, m, lambda a, b: _text_match(a, b, text_thr))
            moments = kept
        moments.sort(key=lambda m: m.t)

        # Captures closer together than the minimum gap collapse into the most informative one.
        spaced: list[Moment] = []
        for m in moments:
            if spaced and m.t - spaced[-1].t < s.min_time_between:
                if m.info > spaced[-1].info:
                    spaced[-1] = m
            else:
                spaced.append(m)
        return spaced
    finally:
        rd.close()


def limit_pages(moments: list[Moment], max_pages: int) -> list[Moment]:
    """When there are too many, keep the most informative ones (in lecture order)."""
    if len(moments) <= max_pages:
        return moments
    top = sorted(range(len(moments)), key=lambda i: moments[i].info, reverse=True)[:max_pages]
    return [moments[i] for i in sorted(top)]
