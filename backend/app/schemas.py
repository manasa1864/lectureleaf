from typing import Optional

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


class JobCreate(BaseModel):
    url: str
    settings: Settings = Settings()
