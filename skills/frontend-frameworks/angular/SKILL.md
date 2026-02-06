---
name: angular
description: |
  Angular 17+ with standalone components and signals. Covers components,
  services, dependency injection, and reactive patterns.

  USE WHEN: user mentions "Angular", "standalone components", "signals", "dependency injection",
  "RxJS", "NgModules", asks about "Angular 17 patterns", "Angular signals"

  DO NOT USE FOR: AngularJS (v1.x) - legacy framework,
  React - use `frontend-react`, Vue - use `vue-composition`, Svelte - use `svelte`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Angular Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket service with signals, RxJS WebSocketSubject, Socket.IO integration, and room management patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `angular` for comprehensive documentation.

## When NOT to Use This Skill

Skip this skill when:
- Working with AngularJS (1.x) - legacy framework
- Building React applications (use `frontend-react`)
- Using Vue framework (use `vue-composition`)
- Working with Svelte (use `svelte`)
- Need only TypeScript without framework (use `typescript`)

## Standalone Components (Angular 17+)

```typescript
import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-counter',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button (click)="increment()">
      Count: {{ count() }}
    </button>
    <p>Double: {{ double() }}</p>
  `
})
export class CounterComponent {
  count = signal(0);
  double = computed(() => this.count() * 2);

  increment() {
    this.count.update(n => n + 1);
  }
}
```

## Signals (Angular 16+)

| API | Purpose |
|-----|---------|
| `signal()` | Create reactive value |
| `computed()` | Derived signal |
| `effect()` | Side effects |
| `input()` | Signal-based input |
| `output()` | Signal-based output |

## Dependency Injection

```typescript
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);

  getUsers() {
    return this.http.get<User[]>('/api/users');
  }
}
```

## Key Patterns

- Prefer standalone components
- Use signals over RxJS for simple state
- `inject()` function over constructor injection
- Lazy load routes for performance

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using NgModules for new apps | Outdated, verbose | Use standalone components |
| Constructor injection only | Less flexible | Use `inject()` function |
| Not using OnPush change detection | Poor performance | Use OnPush + signals |
| Subscribing without unsubscribe | Memory leaks | Use `async` pipe or `takeUntilDestroyed()` |
| Inline styles with CSP | Security issues | Use external stylesheets |
| Not lazy loading routes | Large bundle size | Lazy load feature modules |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Expression changed after check | Modifying state during CD | Use `ChangeDetectorRef.detectChanges()` |
| Service not found | Wrong providedIn scope | Check `@Injectable({ providedIn: 'root' })` |
| Route not loading | Missing lazy load syntax | Use `loadChildren: () => import()` |
| Signal not updating view | Not using signal setter | Use `.set()` or `.update()` |
| Form not reactive | Using template-driven forms | Use `ReactiveFormsModule` |
| HTTP call not firing | Forgot to subscribe | Subscribe to Observable |

## Production Readiness

### Security

```typescript
// HTTP Interceptor for auth
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }
  return next(req);
};
```

### Error Handling

```typescript
// Global error handler
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private errorService = inject(ErrorTrackingService);

  handleError(error: Error): void {
    console.error('Unhandled error:', error);
    this.errorService.trackError(error);
  }
}

// Provide in app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ]
};
```

### Performance

```typescript
// Lazy loading routes
export const routes: Routes = [
  {
    path: 'admin',
    loadChildren: () => import('./admin/routes').then(m => m.ADMIN_ROUTES),
    canActivate: [authGuard],
  },
];

// Change detection optimization
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  ...
})
export class OptimizedComponent {
  data = signal<Data | null>(null);
}

// Defer loading
@Component({
  template: `
    @defer (on viewport) {
      <heavy-component />
    } @placeholder {
      <skeleton-loader />
    }
  `
})
export class DeferredComponent {}
```

### Testing

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('UserComponent', () => {
  let component: UserComponent;
  let fixture: ComponentFixture<UserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserComponent],
      providers: [provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(UserComponent);
    component = fixture.componentInstance;
  });

  it('should update signal', () => {
    component.count.set(5);
    expect(component.count()).toBe(5);
    expect(component.double()).toBe(10);
  });
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Bundle size (initial) | < 200KB |
| Time to Interactive | < 3s |

### Checklist

- [ ] Standalone components (Angular 17+)
- [ ] Signals for reactive state
- [ ] OnPush change detection
- [ ] Lazy loaded routes
- [ ] @defer for heavy components
- [ ] Virtual scrolling for lists
- [ ] Global error handler
- [ ] HTTP interceptors for auth
- [ ] SSR with Angular Universal
- [ ] Zone-less for max performance

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `angular` for comprehensive documentation.

- [Signals Cheatsheet](quick-ref/signals-cheatsheet.md)
- [Component Patterns](quick-ref/component-patterns.md)
