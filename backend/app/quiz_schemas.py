from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

QTYPES = ["mcq", "msq", "short", "long", "numerical", "fill"]
SKIP_REASONS = ["dont_know", "unclear_topic", "no_formula", "unclear_question", "out_of_time", "other"]
SUBJECTIVE = ("short", "long")


class ImageIn(BaseModel):
    name: str = Field("notes", max_length=120)
    data: str = Field(max_length=8_000_000)  # base64 (a data: URL prefix is accepted)


class QuizConfig(BaseModel):
    n: int = Field(10, ge=1, le=40)                       # total questions when types are assigned randomly
    types: list[str] = Field(default_factory=lambda: list(QTYPES))
    counts: Optional[dict[str, int]] = None               # exact number per type when the user chooses
    numerical_format: str = "random"                      # mcq | answer | working | random
    difficulty: str = "mixed"                             # easy | medium | hard | mixed
    time_limit_min: Optional[int] = Field(None, ge=1, le=300)
    strict: bool = False
    conditions: str = Field("", max_length=1500)          # strict mode: what every answer must satisfy
    notes_text: str = Field("", max_length=20000)
    images: list[ImageIn] = Field(default_factory=list, max_length=6)

    @field_validator("types")
    @classmethod
    def _types(cls, v):
        v = [t for t in dict.fromkeys(v) if t in QTYPES]
        if not v:
            raise ValueError("Choose at least one question type")
        return v

    @field_validator("counts")
    @classmethod
    def _counts(cls, v):
        if v is None:
            return v
        v = {k: int(n) for k, n in v.items() if k in QTYPES and int(n) > 0}
        if not v or sum(v.values()) > 40:
            raise ValueError("Choose between 1 and 40 questions in total")
        return v

    @field_validator("numerical_format")
    @classmethod
    def _nf(cls, v):
        return v if v in ("mcq", "answer", "working", "random") else "random"

    @field_validator("difficulty")
    @classmethod
    def _diff(cls, v):
        return v if v in ("easy", "medium", "hard", "mixed") else "mixed"


class QuizCreate(BaseModel):
    job_id: str
    config: QuizConfig = Field(default_factory=QuizConfig)


class SkipIn(BaseModel):
    reason: str = "other"
    note: str = Field("", max_length=300)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        return v if v in SKIP_REASONS else "other"


class AttemptSave(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)
    skips: dict[str, SkipIn] = Field(default_factory=dict)


class AttemptSubmit(AttemptSave):
    time_taken_s: Optional[int] = Field(None, ge=0, le=86400)


class DeriveIn(BaseModel):
    attempt_id: str
    which: str = "missed_or_skipped"  # missed | skipped | missed_or_skipped
