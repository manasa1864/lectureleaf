from typing import Annotated, Optional

from pydantic import BaseModel, Field


class Settings(BaseModel):
    sensitivity: int = Field(50, ge=0, le=100)        # higher = more captures
    min_time_between: int = Field(30, ge=5, le=120)   # seconds
    dupe_sensitivity: int = Field(70, ge=50, le=99)   # higher = stricter duplicate removal
    remove_dupes: bool = True
    skip_transitions: bool = True
    skip_low_quality: bool = True
    page_density: str = "balanced"                    # compact | balanced | detailed
    max_pages: Optional[int] = Field(None, ge=1, le=200)
    pdf_style: str = "lecture"                        # minimal | lecture | revision | cornell
    pdf_page_size: str = "A4"                         # A4 | Letter | A5
    include_timestamps: bool = True
    generate_key_points: bool = True
    include_topic_headings: bool = True
    detect_topics: bool = True

    @property
    def wants_text(self) -> bool:
        return self.generate_key_points or self.include_topic_headings or self.detect_topics


class JobCreate(BaseModel):
    url: str = Field(max_length=500)
    settings: Settings = Settings()


class FramePatch(BaseModel):
    included: Optional[bool] = None
    note: Optional[str] = Field(None, max_length=2000)
    heading: Optional[str] = Field(None, max_length=120)
    key_points: Optional[list[Annotated[str, Field(max_length=400)]]] = Field(None, max_length=8)


class JobPatch(BaseModel):
    title: str = Field(min_length=1, max_length=150)


class SignUp(BaseModel):
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=6, max_length=72)
