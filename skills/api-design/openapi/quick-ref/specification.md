# OpenAPI Specification Quick Reference

> **Knowledge Base:** Read `knowledge/openapi/specification.md` for complete documentation.

## Basic Structure

```yaml
openapi: 3.1.0
info:
  title: My API
  version: 1.0.0
  description: API description
  contact:
    email: support@example.com
  license:
    name: MIT

servers:
  - url: https://api.example.com/v1
    description: Production
  - url: https://staging-api.example.com/v1
    description: Staging

paths:
  /users:
    get:
      summary: List users
      # ...

components:
  schemas:
    User:
      # ...
```

## Paths & Operations

```yaml
paths:
  /users:
    get:
      summary: List users
      description: Returns a list of users
      operationId: getUsers
      tags:
        - Users
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 10
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'

    post:
      summary: Create user
      operationId: createUser
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserInput'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          $ref: '#/components/responses/BadRequest'

  /users/{id}:
    get:
      summary: Get user by ID
      operationId: getUserById
      tags:
        - Users
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          $ref: '#/components/responses/NotFound'
```

## Schemas

```yaml
components:
  schemas:
    User:
      type: object
      required:
        - id
        - email
        - name
      properties:
        id:
          type: string
          format: uuid
          readOnly: true
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 2
          maxLength: 100
        role:
          type: string
          enum: [user, admin, moderator]
          default: user
        createdAt:
          type: string
          format: date-time
          readOnly: true

    CreateUserInput:
      type: object
      required:
        - email
        - name
        - password
      properties:
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 2
        password:
          type: string
          format: password
          minLength: 8

    PaginatedUsers:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/User'
        meta:
          type: object
          properties:
            total:
              type: integer
            page:
              type: integer
            limit:
              type: integer
            totalPages:
              type: integer
```

## Parameters

```yaml
components:
  parameters:
    PageParam:
      name: page
      in: query
      description: Page number
      schema:
        type: integer
        minimum: 1
        default: 1

    LimitParam:
      name: limit
      in: query
      description: Items per page
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 10

    IdParam:
      name: id
      in: path
      required: true
      description: Resource ID
      schema:
        type: string
        format: uuid

# Usage in paths
paths:
  /users:
    get:
      parameters:
        - $ref: '#/components/parameters/PageParam'
        - $ref: '#/components/parameters/LimitParam'
```

## Responses

```yaml
components:
  responses:
    BadRequest:
      description: Bad Request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            status: 400
            code: VALIDATION_ERROR
            message: Validation failed

    Unauthorized:
      description: Unauthorized
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

    NotFound:
      description: Not Found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

  schemas:
    Error:
      type: object
      required:
        - status
        - code
        - message
      properties:
        status:
          type: integer
        code:
          type: string
        message:
          type: string
        details:
          type: array
          items:
            type: object
            properties:
              field:
                type: string
              message:
                type: string
```

## Security

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

    apiKey:
      type: apiKey
      in: header
      name: X-API-Key

    oauth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://example.com/oauth/authorize
          tokenUrl: https://example.com/oauth/token
          scopes:
            read: Read access
            write: Write access

# Global security
security:
  - bearerAuth: []

# Per-operation override
paths:
  /public:
    get:
      security: []  # No auth required

  /admin:
    get:
      security:
        - bearerAuth: []
        - oauth2: [read, write]
```

## Request Bodies

```yaml
paths:
  /upload:
    post:
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                description:
                  type: string

  /users:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserInput'
            examples:
              basic:
                summary: Basic user
                value:
                  email: john@example.com
                  name: John Doe
                  password: securepassword
```

## Callbacks & Webhooks

```yaml
paths:
  /subscribe:
    post:
      callbacks:
        onEvent:
          '{$request.body#/callbackUrl}':
            post:
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        event:
                          type: string
                        data:
                          type: object
              responses:
                '200':
                  description: Callback received
```

**Official docs:** https://spec.openapis.org/oas/v3.1.0
