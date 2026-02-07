---
name: angular-testing
description: |
  Angular testing with TestBed, ComponentFixture, service testing, and HttpTestingController.
  Covers standalone component testing and signal testing.

  USE WHEN: user mentions "Angular testing", "TestBed", "ComponentFixture", "Angular unit test",
  "HttpTestingController", "testing Angular components", "Angular service test"

  DO NOT USE FOR: Playwright E2E tests - use `playwright`,
  React testing - use `react-testing` or `testing-library`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Angular Testing - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `angular`, topic: `testing` for comprehensive documentation.

## Standalone Component Testing

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';

describe('UserListComponent', () => {
  let component: UserListComponent;
  let fixture: ComponentFixture<UserListComponent>;
  let userService: jasmine.SpyObj<UserService>;

  beforeEach(async () => {
    const spy = jasmine.createSpyObj('UserService', ['getUsers']);

    await TestBed.configureTestingModule({
      imports: [UserListComponent],
      providers: [{ provide: UserService, useValue: spy }],
    }).compileComponents();

    fixture = TestBed.createComponent(UserListComponent);
    component = fixture.componentInstance;
    userService = TestBed.inject(UserService) as jasmine.SpyObj<UserService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load users', () => {
    const mockUsers = [{ id: 1, name: 'Alice' }];
    userService.getUsers.and.returnValue(of(mockUsers));

    component.loadUsers();

    expect(component.users()).toEqual(mockUsers);
    expect(component.count()).toBe(1);
  });
});
```

## Service Testing

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UserService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify(); // Ensure no outstanding requests
  });

  it('should fetch users', () => {
    const mockUsers = [{ id: 1, name: 'Alice' }];

    service.getUsers().subscribe(users => {
      expect(users).toEqual(mockUsers);
    });

    const req = httpMock.expectOne('/api/users');
    expect(req.request.method).toBe('GET');
    req.flush(mockUsers);
  });

  it('should handle 404', () => {
    service.getById(999).subscribe({
      error: (err) => expect(err.message).toContain('not found'),
    });

    const req = httpMock.expectOne('/api/users/999');
    req.flush(null, { status: 404, statusText: 'Not Found' });
  });
});
```

## Testing Signals

```typescript
it('should update signal value', () => {
  component.count.set(5);
  expect(component.count()).toBe(5);
  expect(component.double()).toBe(10);
});

it('should compute derived values', () => {
  component.users.set([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
  expect(component.count()).toBe(2);
});
```

## Testing Forms

```typescript
it('should validate required fields', () => {
  component.form.controls.name.setValue('');
  expect(component.form.controls.name.hasError('required')).toBeTrue();

  component.form.controls.name.setValue('Alice');
  expect(component.form.controls.name.valid).toBeTrue();
});

it('should submit valid form', () => {
  component.form.patchValue({ name: 'Alice', email: 'alice@test.com' });
  expect(component.form.valid).toBeTrue();
});
```

## Testing Guards

```typescript
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

describe('authGuard', () => {
  it('should allow authenticated users', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { isAuthenticated: () => true } }],
    });

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    );

    expect(result).toBeTrue();
  });
});
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Testing implementation details | Brittle tests | Test behavior and outputs |
| Not using `httpMock.verify()` | Undetected HTTP issues | Always verify in afterEach |
| Real HTTP in unit tests | Flaky, slow | Use `HttpTestingController` |
| Not testing error paths | Incomplete coverage | Test error scenarios |
