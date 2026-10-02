"""Study notes without an LLM: headings, key points and a summary picked from the transcript itself.

Sentences are scored by how distinctive their words are for their section (TF-IDF), so a section's key
points are the sentences that talk about what makes it different from the rest of the lecture."""
import math
import re
from collections import Counter

from .notes import KEY_POINTS_PER_DENSITY, Section, Segment

_STOP = set("""a about above after again all also am an and any are as at be because been before being below between both but by
can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into
is it its itself just let lets like me more most my no nor not now of off on once only or other our out over own really same she
should so some such than that the their them then there these they this those through to too under until up us very was we were
what when where which while who whom why will with would you your yeah okay ok actually basically see look suppose say going
gonna want need know think thing things way one two three right ones guys friends next first second let's don't it's that's
video discuss discussed discussing talk talking""".split())
_FILLER = re.compile(r"\b(subscribe|like and share|comment below|bell icon|channel|welcome|thank you|thanks for watching|"
                     r"see you|in the next video|last video|previous video|in this video|good news)\b", re.I)
_WORD = re.compile(r"[A-Za-z][A-Za-z0-9'-]{2,}")


def _words(text: str) -> list[str]:
    return [w.lower() for w in _WORD.findall(text) if w.lower() not in _STOP]


def _units(segments: list[Segment]) -> list[Segment]:
    """Whisper segments, with very short ones merged into the next so each unit reads as a sentence."""
    out: list[Segment] = []
    carry = None
    for s in segments:
        if carry:
            s = Segment(carry.start, s.end, carry.text + " " + s.text)
            carry = None
        if len(s.text.split()) < 5:
            carry = s
        else:
            out.append(s)
    if carry:
        out.append(carry)
    return out


def _trim(text: str, limit: int = 24) -> str:
    words = text.split()
    text = " ".join(words[:limit])
    text = text.strip(" ,;:-")
    if len(words) > limit:
        text = text.rstrip(".") + "..."
    return text[:1].upper() + text[1:]


def _title_from_screen(text: str) -> str:
    """The first line of the on-screen text, if it reads like a slide title."""
    for line in text.splitlines()[:3]:
        line = line.strip(" -•*:")
        letters = sum(c.isalpha() for c in line)
        if 4 <= len(line) <= 70 and letters >= 0.7 * len(line) and len(line.split()) <= 9:
            return line[:1].upper() + line[1:]
    return ""


def _idf(docs: list[list[str]]) -> dict[str, float]:
    n = len(docs)
    df = Counter(w for d in docs for w in set(d))
    return {w: math.log((1 + n) / (1 + c)) + 1 for w, c in df.items()}


def _score(text: str, tf: Counter, idf: dict[str, float]) -> float:
    ws = _words(text)
    if len(ws) < 3:
        return 0.0
    score = sum(tf[w] * idf.get(w, 1.0) for w in ws) / math.sqrt(len(text.split()) + 4)
    return score * (0.3 if _FILLER.search(text) else 1.0)


def _keyphrase(text: str, tf: Counter, idf: dict[str, float]) -> str:
    """The most distinctive two-word phrase of the section, plus its most distinctive other word."""
    toks = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9'-]{1,}", text)]
    pairs: Counter = Counter()
    for a, b in zip(toks, toks[1:]):
        if a not in _STOP and b not in _STOP and len(a) > 2 and len(b) > 2 and a != b:
            pairs[(a, b)] += idf.get(a, 1.0) + idf.get(b, 1.0)
    top_pair = max(pairs.items(), key=lambda kv: kv[1])[0] if pairs else None
    singles = [w for w, _ in sorted(tf.items(), key=lambda kv: kv[1] * idf.get(kv[0], 1.0), reverse=True)]
    parts = [" ".join(top_pair)] if top_pair else []
    extra = next((w for w in singles if not top_pair or w not in top_pair), None)
    if extra:
        parts.append(extra)
    if not parts:
        return ""
    heading = ", ".join(parts)
    return heading[:1].upper() + heading[1:]


def fill_missing(
    title: str, times: list[int], segments: list[Segment], sections: list[Section], summary: str,
    density: str, slide_texts: list[str] | None = None,
) -> tuple[list[Section], str]:
    """Complete whatever the LLM didn't provide (all of it, if no LLM was available)."""
    n_points = KEY_POINTS_PER_DENSITY.get(density, 3)
    units = _units(segments)
    bounds = [(max(t - 5, 0) if i else 0, times[i + 1] - 5 if i + 1 < len(times) else float("inf")) for i, t in enumerate(times)]
    per_section = [[u for u in units if lo <= u.start < hi] for lo, hi in bounds]
    docs = [_words(" ".join(u.text for u in us)) for us in per_section]
    idf = _idf([d for d in docs if d] or [[]])

    out = list(sections)
    # A title that appears on several frames (e.g. a whiteboard heading) cannot tell the pages apart.
    screen = [_title_from_screen(t) if t else "" for t in (slide_texts or [""] * len(times))]
    count = Counter(x.lower() for x in screen if x)
    screen = [x if x and count[x.lower()] == 1 else "" for x in screen]
    for i, us in enumerate(per_section):
        sec = out[i]
        if sec.heading and sec.key_points:
            continue
        tf = Counter(docs[i])
        if not sec.key_points and us:
            ranked = sorted(us, key=lambda u: _score(u.text, tf, idf), reverse=True)
            chosen = [u for u in ranked if _score(u.text, tf, idf) > 0][:n_points]
            chosen.sort(key=lambda u: u.start)
            sec = Section(sec.heading, [_trim(u.text) for u in chosen])
        if not sec.heading:
            heading = screen[i]
            if not heading and docs[i]:
                heading = _keyphrase(" ".join(u.text for u in us), tf, idf)
            sec = Section(heading[:90], sec.key_points)
        out[i] = sec

    if not summary and units:
        tf_all = Counter(w for d in docs for w in d)
        ranked = sorted(units, key=lambda u: _score(u.text, tf_all, idf), reverse=True)
        picks = sorted([u for u in ranked if _score(u.text, tf_all, idf) > 0][:4], key=lambda u: u.start)
        summary = " ".join(_trim(u.text, 30).rstrip(".") + "." for u in picks)
    return out, summary
