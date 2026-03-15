# FastAPI Dependencies

> **Knowledge Base:** Read `knowledge/fastapi/dependencies.md` for complete documentation.

## Basic Dependency

```python
from fastapi import Depends, FastAPI

app = FastAPI()

# Simple dependency
def get_db():
    db = Database()
    try:
        yield db
    finally:
        db.close()

@app.get("/users")
async def get_users(db = Depends(get_db)):
    return db.query(User).all()
```

## Class Dependencies

```python
from fastapi import Depends, Query

class Pagination:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        size: int = Query(10, ge=1, le=100)
    ):
        self.page = page
        self.size = size
        self.skip = (page - 1) * size

@app.get("/items")
async def list_items(pagination: Pagination = Depends()):
    return items[pagination.skip:pagination.skip + pagination.size]
```

## Authentication Dependency

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    user = await verify_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return user

async def get_current_active_user(
    user: User = Depends(get_current_user)
):
    if not user.is_active:
        raise HTTPException(400, "Inactive user")
    return user

@app.get("/me")
async def read_me(user: User = Depends(get_current_active_user)):
    return user
```

## Dependency with Path Parameters

```python
async def get_item_or_404(
    item_id: int,
    db: Session = Depends(get_db)
) -> Item:
    item = db.query(Item).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    return item

@app.get("/items/{item_id}")
async def read_item(item: Item = Depends(get_item_or_404)):
    return item

@app.put("/items/{item_id}")
async def update_item(
    item: Item = Depends(get_item_or_404),
    data: ItemUpdate = ...
):
    return item.update(data)
```

## Sub-Dependencies

```python
def get_settings():
    return Settings()

def get_db(settings: Settings = Depends(get_settings)):
    return Database(settings.database_url)

def get_user_repo(db = Depends(get_db)):
    return UserRepository(db)

@app.get("/users")
async def get_users(repo = Depends(get_user_repo)):
    return repo.find_all()
```

## Global Dependencies

```python
from fastapi import FastAPI, Depends

async def verify_api_key(api_key: str = Header(...)):
    if api_key != "secret":
        raise HTTPException(403, "Invalid API key")

# Apply to all routes
app = FastAPI(dependencies=[Depends(verify_api_key)])

# Or to router
router = APIRouter(dependencies=[Depends(verify_api_key)])
```

## Annotated Dependencies (Python 3.9+)

```python
from typing import Annotated
from fastapi import Depends

# Define once
CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_db)]

# Reuse
@app.get("/profile")
async def profile(user: CurrentUser, db: DbSession):
    return user

@app.get("/settings")
async def settings(user: CurrentUser, db: DbSession):
    return user.settings
```

**Official docs:** https://fastapi.tiangolo.com/tutorial/dependencies/
