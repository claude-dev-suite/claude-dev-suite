---
name: angular-http
description: |
  Angular HttpClient with interceptors, error handling, retry, and caching patterns.
  Covers functional interceptors and typed responses.

  USE WHEN: user mentions "HttpClient", "Angular HTTP", "interceptors", "API calls",
  "Angular REST", "HTTP error handling", "auth interceptor"

  DO NOT USE FOR: Axios - use `axios` skill, Fetch API directly,
  backend HTTP frameworks
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Angular HTTP - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `angular`, topic: `http` for comprehensive documentation.

## HttpClient Setup

```typescript
// app.config.ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
  ]
};
```

## Functional Interceptors (Angular 15+)

```typescript
// Auth interceptor
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }
  return next(req);
};

// Error interceptor
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        inject(Router).navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};

// Loading interceptor
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);
  loading.show();
  return next(req).pipe(finalize(() => loading.hide()));
};
```

## Service Pattern with Error Handling

```typescript
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private baseUrl = '/api/users';

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.baseUrl).pipe(
      retry({ count: 2, delay: 1000 }),
      catchError(this.handleError),
    );
  }

  create(user: CreateUserDto): Observable<User> {
    return this.http.post<User>(this.baseUrl, user).pipe(
      catchError(this.handleError),
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let message = 'An error occurred';
    if (error.status === 0) {
      message = 'Network error';
    } else if (error.status === 404) {
      message = 'Resource not found';
    }
    return throwError(() => new Error(message));
  }
}
```

## Typed Responses

```typescript
// With observe: 'response' for full response
getWithHeaders(): Observable<HttpResponse<User[]>> {
  return this.http.get<User[]>(this.baseUrl, { observe: 'response' });
}

// With params
search(query: string, page: number): Observable<PaginatedResult<User>> {
  const params = new HttpParams()
    .set('q', query)
    .set('page', page.toString());
  return this.http.get<PaginatedResult<User>>(this.baseUrl, { params });
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Class-based interceptors | Verbose, deprecated | Use functional `HttpInterceptorFn` |
| Not typing responses | No compile-time checks | Use `http.get<Type>()` |
| Subscribing in services | Tight coupling | Return observables, subscribe in components |
| No error handling | Silent failures | Use `catchError` in service |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| HTTP call not firing | Forgot to subscribe | Subscribe to the observable |
| Interceptor not running | Not in providers | Add to `withInterceptors()` |
| CORS error | Backend config | Configure CORS on server |
| Wrong content type | Missing header | HttpClient sets JSON by default |
