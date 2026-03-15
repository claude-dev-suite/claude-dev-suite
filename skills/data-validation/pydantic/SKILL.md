---
name: pydantic
description: |
  Pydantic v2 data validation library. Covers BaseModel, field validators,
  custom types, serialization, and schema generation. Use when validating
  data structures, parsing configs, or defining typed data models in Python.

  USE WHEN: user mentions "pydantic", "BaseModel", "Field()", "model_validator",
  "field_validator", "Annotated", "model_dump", "model_validate",
  "pydantic settings", "pydantic v2"

  DO NOT USE FOR: TypeScript types/interfaces, SQLAlchemy ORM models, dataclasses
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Pydantic v2 Core Knowledge

## Installation

```bash
pip install pydantic>=2.0
pip install pydantic-settings  # for settings management
```

## BaseModel Basics

```python
from pydantic import BaseModel, Field
from typing import Annotated

class Tag(BaseModel):
    name: str
    area: int
    description: str = ""
    active: bool = True

# Instantiate
tag = Tag(name="11301.FIC.001", area=11301, description="Flow controller")
tag = Tag.model_validate({"name": "11301.FIC.001", "area": 11301})

# Serialize
tag.model_dump()                    # -> dict
tag.model_dump(exclude_none=True)   # skip None fields
tag.model_dump_json()               # -> JSON string
tag.model_json_schema()             # -> JSON Schema dict
```

## Field Configuration

```python
from pydantic import BaseModel, Field
from typing import Annotated

class MotorTag(BaseModel):
    # Required field
    tag: str = Field(..., min_length=1, max_length=50, pattern=r'^\d{5}\.\w+\.\w+$')

    # With alias (for dict keys that differ from Python attr names)
    node_name: str = Field(..., alias="NodeName")

    # With default
    power_kw: float = Field(default=0.0, ge=0.0, le=10000.0)

    # Computed default
    label: str = Field(default_factory=lambda: "")

    # Metadata
    area: int = Field(..., description="ISA-5.1 area code", examples=[11301, 11090])

class Config:
    populate_by_name = True  # allow both alias and field name
```

## Validators (v2 API)

```python
from pydantic import BaseModel, field_validator, model_validator
from typing import Self

class TagModel(BaseModel):
    tag: str
    area: int
    description: str

    # Field-level validator
    @field_validator('tag')
    @classmethod
    def normalize_tag(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError('tag cannot be empty')
        return v

    # Validate multiple fields
    @field_validator('area')
    @classmethod
    def valid_area(cls, v: int) -> int:
        if v < 10000 or v > 99999:
            raise ValueError(f'area must be 5-digit code, got {v}')
        return v

    # Cross-field validation (model-level)
    @model_validator(mode='after')
    def check_area_in_tag(self) -> Self:
        if not self.tag.startswith(str(self.area)):
            raise ValueError(f'tag {self.tag!r} does not start with area {self.area}')
        return self
```

## Annotated Types (reusable constraints)

```python
from typing import Annotated
from pydantic import Field, BaseModel

# Define reusable types
AreaCode = Annotated[int, Field(ge=10000, le=99999, description="5-digit area code")]
TagName = Annotated[str, Field(min_length=1, max_length=50, pattern=r'^[\w.]+$')]
PositiveFloat = Annotated[float, Field(gt=0.0)]

class Equipment(BaseModel):
    area: AreaCode
    tag: TagName
    power_kw: PositiveFloat
```

## Handling Optional and Union Types

```python
from pydantic import BaseModel
from typing import Optional

class Reading(BaseModel):
    tag: str
    value: float | None = None          # None by default
    unit: str | None = None
    alarm_high: Optional[float] = None  # equivalent to float | None

# v2: None is only allowed if explicitly typed as Optional/| None
```

## Parsing and Error Handling

```python
from pydantic import ValidationError

try:
    tag = MotorTag(tag="", area=999)
except ValidationError as e:
    print(e.error_count())   # number of errors
    for error in e.errors():
        print(error['loc'])  # field path
        print(error['msg'])  # human-readable message
        print(error['type']) # error type identifier

# Partial validation (collect all errors, not fail-fast)
# ValidationError already collects all field errors by default
```

## DataFrame Row Validation

```python
import pandas as pd
from pydantic import BaseModel, ValidationError

class Row(BaseModel):
    tag: str
    area: int
    power_kw: float

def validate_df(df: pd.DataFrame) -> tuple[list[Row], list[dict]]:
    valid, errors = [], []
    for i, row in df.iterrows():
        try:
            valid.append(Row.model_validate(row.to_dict()))
        except ValidationError as e:
            errors.append({"row": i, "errors": e.errors()})
    return valid, errors
```

## Nested Models

```python
class Signal(BaseModel):
    name: str
    data_type: str
    direction: str  # "IN" | "OUT"

class FunctionBlock(BaseModel):
    name: str
    library: str
    signals: list[Signal] = []

    def get_inputs(self) -> list[Signal]:
        return [s for s in self.signals if s.direction == "IN"]

# Instantiate nested
fb = FunctionBlock(
    name="IDF_1",
    library="BST_LIB_EXT",
    signals=[
        Signal(name="AC", data_type="BOOL", direction="IN"),
        Signal(name="RUN", data_type="BOOL", direction="OUT"),
    ]
)
```

## Pydantic Settings

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="APP_",
        case_sensitive=False,
    )

    anthropic_api_key: str
    db_path: str = "data/project.db"
    debug: bool = False

# Reads from env vars APP_ANTHROPIC_API_KEY, APP_DB_PATH, etc.
settings = AppSettings()
```

## Serialization Control

```python
from pydantic import BaseModel, field_serializer
from datetime import datetime

class Record(BaseModel):
    tag: str
    created_at: datetime

    @field_serializer('created_at')
    def serialize_dt(self, dt: datetime) -> str:
        return dt.strftime('%Y-%m-%d %H:%M:%S')

    model_config = {
        'json_encoders': {datetime: lambda v: v.isoformat()}
    }

r = Record(tag="FIC-001", created_at=datetime.now())
r.model_dump()                     # datetime object
r.model_dump(mode='json')          # serialized via field_serializer
```

## Common Patterns

| Use Case | Pattern |
|----------|---------|
| Optional field | `field: str \| None = None` |
| List with min length | `tags: list[str] = Field(min_length=1)` |
| Enum field | `status: Literal["active", "inactive"]` |
| Coerce string to int | `model_config = ConfigDict(coerce_numbers_to_str=True)` |
| Allow extra fields | `model_config = ConfigDict(extra='allow')` |
| Forbid extra fields | `model_config = ConfigDict(extra='forbid')` |
| From ORM | `model_config = ConfigDict(from_attributes=True)` |
