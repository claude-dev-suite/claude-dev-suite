---
name: angular-routing
description: |
  Angular Router with lazy loading, guards, resolvers, and route params.
  Covers standalone route configuration and functional guards.

  USE WHEN: user mentions "Angular routing", "lazy loading", "route guards", "resolvers",
  "navigation", "Angular routes", "canActivate", "loadChildren"

  DO NOT USE FOR: React Router - use `react-router`, Vue Router - use `vue-composition`,
  Next.js routing - use `nextjs`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Angular Routing - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `angular`, topic: `routing` for comprehensive documentation.

## Route Configuration (Standalone)

```typescript
// app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component')
      .then(m => m.DashboardComponent),
  },
  {
    path: 'users',
    loadChildren: () => import('./features/users/users.routes')
      .then(m => m.USERS_ROUTES),
    canActivate: [authGuard],
  },
  { path: '**', loadComponent: () => import('./not-found.component').then(m => m.NotFoundComponent) },
];
```

## Lazy Loading Feature Routes

```typescript
// features/users/users.routes.ts
import { Routes } from '@angular/router';

export const USERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./user-list.component').then(m => m.UserListComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./user-detail.component').then(m => m.UserDetailComponent),
    resolve: { user: userResolver },
  },
];
```

## Functional Guards (Angular 15+)

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const requiredRole = route.data['role'] as string;
  return authService.hasRole(requiredRole);
};
```

## Functional Resolvers

```typescript
import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { UserService } from './user.service';
import { User } from './user.model';

export const userResolver: ResolveFn<User> = (route) => {
  const userService = inject(UserService);
  const id = Number(route.paramMap.get('id'));
  return userService.getById(id);
};
```

## Route Parameters with Input Binding

```typescript
// Enable in app.config.ts: provideRouter(routes, withComponentInputBinding())

@Component({ standalone: true, template: `<p>User {{ id }}</p>` })
export class UserDetailComponent {
  @Input() id!: string; // Automatically bound from :id route param
}
```

## Navigation

```typescript
import { Router, RouterLink } from '@angular/router';

// Template
// <a [routerLink]="['/users', user.id]">View User</a>
// <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>

// Programmatic
@Component({ ... })
export class SomeComponent {
  private router = inject(Router);

  navigate() {
    this.router.navigate(['/users', 42], {
      queryParams: { tab: 'profile' },
    });
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Eager loading all routes | Large bundle size | Use `loadComponent` / `loadChildren` |
| Class-based guards | Verbose, deprecated pattern | Use functional guards with `inject()` |
| Subscribing to params manually | Boilerplate, leak risk | Use `withComponentInputBinding()` |
| Nested route configs in app.routes | Hard to maintain | Split into feature route files |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Route not matching | Order matters | Put specific routes before wildcards |
| Guard not triggering | Not in route config | Add to `canActivate` array |
| Lazy load fails | Wrong export | Ensure component is exported |
| Query params lost | Navigate without preserve | Use `queryParamsHandling: 'merge'` |
