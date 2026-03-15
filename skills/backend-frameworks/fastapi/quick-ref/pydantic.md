# FastAPI Pydantic Models

> **Knowledge Base:** Read `knowledge/fastapi/pydantic.md` for complete documentation.

## Basic Models

```python
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime
from typing import Optional

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=2, max_length=100)

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)  # For ORM mode
```

## Field Validation

```python
from pydantic import BaseModel, Field, field_validator
from typing import Annotated

class Product(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    price: float = Field(..., gt=0, description="Price must be positive")
    quantity: int = Field(default=0, ge=0)
    tags: list[str] = Field(default_factory=list, max_length=10)

    @field_validator('name')
    @classmethod
    def name_must_be_alphanumeric(cls, v: str) -> str:
        if not v.replace(' ', '').isalnum():
            raise ValueError('must be alphanumeric')
        return v.title()

# Using Annotated for reusable validation
PositiveInt = Annotated[int, Field(gt=0)]
```

## Nested Models

```python
class Address(BaseModel):
    street: str
    city: str
    country: str
    zip_code: str

class Company(BaseModel):
    name: str
    address: Address
    employees: list["Employee"] = []

class Employee(BaseModel):
    name: str
    position: str
    company_id: int
```

## Request/Response Models

```python
from fastapi import FastAPI

app = FastAPI()

class ItemCreate(BaseModel):
    name: str
    price: float

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None

class ItemResponse(BaseModel):
    id: int
    name: str
    price: float

@app.post("/items", response_model=ItemResponse)
async def create_item(item: ItemCreate) -> ItemResponse:
    # item is validated automatically
    return ItemResponse(id=1, **item.model_dump())

@app.patch("/items/{id}", response_model=ItemResponse)
async def update_item(id: int, item: ItemUpdate) -> ItemResponse:
    # Only provided fields are set
    update_data = item.model_dump(exclude_unset=True)
    return ItemResponse(id=id, **update_data)
```

## Model Config

```python
from pydantic import BaseModel, ConfigDict

class User(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,      # ORM mode
        str_strip_whitespace=True, # Strip whitespace
        str_min_length=1,          # Non-empty strings
        extra='forbid',            # No extra fields
        populate_by_name=True,     # Allow alias
    )

    id: int
    email: str = Field(..., alias='emailAddress')
```

## Generic Response

```python
from typing import TypeVar, Generic
from pydantic import BaseModel

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int

# Usage
@app.get("/users", response_model=PaginatedResponse[UserResponse])
async def list_users(page: int = 1, size: int = 10):
    return PaginatedResponse(
        items=users,
        total=100,
        page=page,
        size=size,
        pages=10
    )
```

## Serialization

```python
user = User(id=1, email="test@example.com", name="John")

# To dict
user.model_dump()
user.model_dump(exclude={'password'})
user.model_dump(include={'id', 'email'})
user.model_dump(exclude_unset=True)

# To JSON
user.model_dump_json()
```

**Official docs:** https://docs.pydantic.dev/latest/
