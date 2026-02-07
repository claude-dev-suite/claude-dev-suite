---
name: ngrx
description: |
  NgRx Store, Effects, Entity, and ComponentStore for Angular state management.
  Covers reactive patterns with signals integration.

  USE WHEN: user mentions "NgRx", "Angular state management", "NgRx Store", "NgRx Effects",
  "NgRx Entity", "ComponentStore", "Angular Redux"

  DO NOT USE FOR: Redux Toolkit - use `redux-toolkit`, Zustand - use `zustand`,
  Pinia - use `pinia`, simple Angular signals state
allowed-tools: Read, Grep, Glob, Write, Edit
---
# NgRx State Management - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `angular` for NgRx patterns.

## Store Setup

```typescript
// app.config.ts
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

export const appConfig: ApplicationConfig = {
  providers: [
    provideStore({ users: usersReducer }),
    provideEffects([UsersEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ]
};
```

## Actions

```typescript
import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const UsersActions = createActionGroup({
  source: 'Users',
  events: {
    'Load Users': emptyProps(),
    'Load Users Success': props<{ users: User[] }>(),
    'Load Users Failure': props<{ error: string }>(),
    'Add User': props<{ user: User }>(),
    'Remove User': props<{ id: number }>(),
  },
});
```

## Reducer with createFeature

```typescript
import { createFeature, createReducer, on } from '@ngrx/store';

export interface UsersState {
  users: User[];
  loading: boolean;
  error: string | null;
}

const initialState: UsersState = {
  users: [],
  loading: false,
  error: null,
};

export const usersFeature = createFeature({
  name: 'users',
  reducer: createReducer(
    initialState,
    on(UsersActions.loadUsers, (state) => ({ ...state, loading: true, error: null })),
    on(UsersActions.loadUsersSuccess, (state, { users }) => ({
      ...state, users, loading: false,
    })),
    on(UsersActions.loadUsersFailure, (state, { error }) => ({
      ...state, error, loading: false,
    })),
    on(UsersActions.addUser, (state, { user }) => ({
      ...state, users: [...state.users, user],
    })),
    on(UsersActions.removeUser, (state, { id }) => ({
      ...state, users: state.users.filter(u => u.id !== id),
    })),
  ),
});

export const { selectUsers, selectLoading, selectError } = usersFeature;
```

## Effects

```typescript
import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, exhaustMap, map, of } from 'rxjs';

export class UsersEffects {
  private actions$ = inject(Actions);
  private userService = inject(UserService);

  loadUsers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UsersActions.loadUsers),
      exhaustMap(() =>
        this.userService.getUsers().pipe(
          map(users => UsersActions.loadUsersSuccess({ users })),
          catchError(error => of(UsersActions.loadUsersFailure({ error: error.message }))),
        )
      )
    )
  );
}
```

## Component Integration with Signals

```typescript
import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { selectUsers, selectLoading } from './users.reducer';
import { UsersActions } from './users.actions';

@Component({
  standalone: true,
  template: `
    @if (loading()) {
      <app-spinner />
    }
    @for (user of users(); track user.id) {
      <app-user-card [user]="user" (delete)="remove(user.id)" />
    }
  `
})
export class UsersComponent {
  private store = inject(Store);
  users = this.store.selectSignal(selectUsers);
  loading = this.store.selectSignal(selectLoading);

  constructor() {
    this.store.dispatch(UsersActions.loadUsers());
  }

  remove(id: number) {
    this.store.dispatch(UsersActions.removeUser({ id }));
  }
}
```

## ComponentStore (Lightweight Alternative)

```typescript
import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { switchMap } from 'rxjs';

interface UsersState {
  users: User[];
  loading: boolean;
}

@Injectable()
export class UsersStore extends ComponentStore<UsersState> {
  constructor(private userService: UserService) {
    super({ users: [], loading: false });
  }

  readonly users = this.selectSignal(state => state.users);
  readonly loading = this.selectSignal(state => state.loading);

  readonly loadUsers = this.effect<void>(trigger$ =>
    trigger$.pipe(
      switchMap(() => {
        this.patchState({ loading: true });
        return this.userService.getUsers().pipe(
          tapResponse(
            users => this.patchState({ users, loading: false }),
            () => this.patchState({ loading: false }),
          )
        );
      })
    )
  );
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Store for local component state | Over-engineering | Use signals or ComponentStore |
| Dispatching in effects | Infinite loops | Return actions from effects |
| Not using `createActionGroup` | Verbose action creators | Use `createActionGroup` |
| Subscribing to store in components | Memory leaks | Use `selectSignal()` |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| State not updating | Immutability violation | Return new object in reducer |
| Effect not triggering | Wrong action type | Check `ofType()` matches |
| DevTools not showing | Missing provider | Add `provideStoreDevtools()` |
| Selector returning undefined | Feature not registered | Add to `provideStore()` |
