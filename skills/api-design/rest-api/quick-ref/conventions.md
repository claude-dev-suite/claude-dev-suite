# REST API Conventions Quick Reference

> **Knowledge Base:** Read `knowledge/rest-api/conventions.md` for complete documentation.

## HTTP Methods

| Method | Description | Idempotent | Safe |
|--------|-------------|------------|------|
| GET | Read resource | Yes | Yes |
| POST | Create resource | No | No |
| PUT | Replace resource | Yes | No |
| PATCH | Update resource | No | No |
| DELETE | Delete resource | Yes | No |

## URL Structure

```
GET    /users              # List users
GET    /users/:id          # Get single user
POST   /users              # Create user
PUT    /users/:id          # Replace user
PATCH  /users/:id          # Update user
DELETE /users/:id          # Delete user

# Nested resources
GET    /users/:id/posts    # List user's posts
POST   /users/:id/posts    # Create post for user
GET    /posts/:id/comments # List post's comments

# Query parameters
GET /users?page=1&limit=10&sort=name&order=asc
GET /users?filter[status]=active&filter[role]=admin
GET /products?search=phone&category=electronics
```

## HTTP Status Codes

```
2xx Success:
200 OK              - General success
201 Created         - Resource created (POST)
204 No Content      - Success with no body (DELETE)

3xx Redirection:
301 Moved Permanently
302 Found
304 Not Modified    - Cached response valid

4xx Client Errors:
400 Bad Request     - Invalid request body/params
401 Unauthorized    - Authentication required
403 Forbidden       - Authenticated but not authorized
404 Not Found       - Resource doesn't exist
405 Method Not Allowed
409 Conflict        - Resource conflict (duplicate)
422 Unprocessable   - Validation failed
429 Too Many Requests - Rate limited

5xx Server Errors:
500 Internal Server Error
502 Bad Gateway
503 Service Unavailable
504 Gateway Timeout
```

## Response Format

```json
// Success - Single resource
{
  "data": {
    "id": "123",
    "type": "user",
    "attributes": {
      "name": "John",
      "email": "john@example.com"
    }
  }
}

// Success - Collection
{
  "data": [
    { "id": "1", "name": "John" },
    { "id": "2", "name": "Jane" }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  },
  "links": {
    "self": "/users?page=1",
    "next": "/users?page=2",
    "prev": null,
    "first": "/users?page=1",
    "last": "/users?page=10"
  }
}

// Error
{
  "error": {
    "status": 400,
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "Invalid email format" },
      { "field": "age", "message": "Must be at least 18" }
    ]
  }
}
```

## Headers

```
Request Headers:
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>
X-Request-ID: <uuid>

Response Headers:
Content-Type: application/json
X-Request-ID: <uuid>
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640000000
Cache-Control: max-age=3600

CORS Headers:
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
```

## Versioning

```
# URL Path (recommended)
GET /api/v1/users
GET /api/v2/users

# Header
GET /api/users
Accept: application/vnd.api+json; version=1

# Query Parameter
GET /api/users?version=1
```

## Filtering & Sorting

```
# Filtering
GET /users?status=active
GET /users?role=admin&status=active
GET /users?filter[status]=active
GET /users?created_at[gte]=2024-01-01

# Sorting
GET /users?sort=name          # Ascending
GET /users?sort=-created_at   # Descending
GET /users?sort=name,-created_at  # Multiple

# Pagination
GET /users?page=2&limit=20
GET /users?offset=20&limit=20
GET /users?cursor=abc123&limit=20

# Sparse Fields
GET /users?fields=id,name,email
GET /users?fields[users]=id,name&fields[posts]=title
```

## Best Practices

```markdown
Naming:
- Use plural nouns: /users not /user
- Use kebab-case: /user-profiles not /userProfiles
- Avoid verbs: /users not /getUsers

Resources:
- Use nouns for resources
- Nest logically: /users/:id/orders
- Limit nesting to 2 levels

Responses:
- Always return JSON
- Use consistent structure
- Include hypermedia links (HATEOAS)
- Return created resource on POST

Security:
- Use HTTPS only
- Validate all input
- Rate limit endpoints
- Use proper auth (OAuth2, JWT)
```

**Official docs:** https://restfulapi.net/
