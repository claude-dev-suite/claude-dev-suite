# Python Type Hints

> **Knowledge Base:** Read `knowledge/python/typing.md` for complete documentation.

## Modern Syntax (Python 3.10+)

```python
# Use | instead of Union (3.10+)
def greet(name: str | None = None) -> str:
    return f"Hello {name or 'World'}"

# Use built-in generics (3.9+)
names: list[str] = ["John", "Jane"]
scores: dict[str, int] = {"math": 95}
coords: tuple[float, float] = (1.0, 2.0)
unique_ids: set[int] = {1, 2, 3}
```

## PEP 695 - Type Parameters (Python 3.12+)

```python
# Generic function - NEW syntax
def first[T](items: list[T]) -> T | None:
    return items[0] if items else None

# Generic class - NEW syntax
class Stack[T]:
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()

# Type aliases - NEW syntax
type Point = tuple[float, float]
type Vector[T] = list[T]
type Handler[T] = Callable[[T], None]

# Bounded type parameters
def max_item[T: (int, float)](items: list[T]) -> T:
    return max(items)

# Constrained to a protocol
from typing import SupportsLessThan
def sort_items[T: SupportsLessThan](items: list[T]) -> list[T]:
    return sorted(items)
```

## Legacy Syntax (Pre-3.12)

```python
from typing import TypeVar, Generic

T = TypeVar("T")

def first(items: list[T]) -> T | None:
    return items[0] if items else None

class Stack(Generic[T]):
    def __init__(self) -> None:
        self._items: list[T] = []
```

## Functions

```python
from typing import Callable, TypeVar

# Function type
def apply(fn: Callable[[int, int], int], a: int, b: int) -> int:
    return fn(a, b)

# *args and **kwargs
def log(*args: str, **kwargs: int) -> None:
    pass

# Generic function
T = TypeVar('T')

def first(items: list[T]) -> T | None:
    return items[0] if items else None
```

## Classes

```python
from typing import ClassVar, Self
from dataclasses import dataclass

@dataclass
class User:
    name: str
    email: str
    age: int = 0

    # Class variable
    instances: ClassVar[int] = 0

    # Return self type
    def copy(self) -> Self:
        return User(self.name, self.email, self.age)
```

## Variance (Advanced)

```python
from typing import TypeVar

# Invariant (default) - T must match exactly
T = TypeVar("T")

# Covariant - can use subtypes (3.12+: use [T: covariant])
T_co = TypeVar("T_co", covariant=True)

# Contravariant - can use supertypes
T_contra = TypeVar("T_contra", contravariant=True)

# Python 3.12+ variance
class ReadOnlyList[T_co]:  # Implicitly covariant
    def get(self, index: int) -> T_co: ...
```

## TypedDict

```python
from typing import TypedDict, NotRequired

class UserDict(TypedDict):
    name: str
    email: str
    age: NotRequired[int]  # Optional key

def create_user(data: UserDict) -> None:
    print(data["name"])  # OK
    print(data["age"])   # OK (may not exist)
```

## Literal & Final

```python
from typing import Literal, Final

# Literal types
def set_status(status: Literal["active", "inactive", "pending"]) -> None:
    pass

set_status("active")  # OK
set_status("unknown")  # Error

# Constants
MAX_SIZE: Final = 100
API_URL: Final[str] = "https://api.example.com"
```

## Protocol (Structural Typing)

```python
from typing import Protocol

class Drawable(Protocol):
    def draw(self) -> None: ...

class Circle:
    def draw(self) -> None:
        print("Drawing circle")

def render(item: Drawable) -> None:
    item.draw()

render(Circle())  # OK - Circle has draw()
```

**Official docs:** https://docs.python.org/3/library/typing.html
