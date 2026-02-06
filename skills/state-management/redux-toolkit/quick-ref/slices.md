# Redux Toolkit Slices Quick Reference

> **Knowledge Base:** Read `knowledge/redux-toolkit/slices.md` for complete documentation.

## createSlice

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CounterState {
  value: number;
}

const initialState: CounterState = {
  value: 0,
};

const counterSlice = createSlice({
  name: 'counter',
  initialState,
  reducers: {
    increment: (state) => {
      state.value += 1; // Immer allows "mutation"
    },
    decrement: (state) => {
      state.value -= 1;
    },
    incrementByAmount: (state, action: PayloadAction<number>) => {
      state.value += action.payload;
    },
    reset: () => initialState,
  },
});

export const { increment, decrement, incrementByAmount, reset } = counterSlice.actions;
export default counterSlice.reducer;
```

## Store Configuration

```typescript
import { configureStore } from '@reduxjs/toolkit';
import counterReducer from './counterSlice';
import userReducer from './userSlice';

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    user: userReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

## Typed Hooks

```typescript
// hooks.ts
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

## Using in Components

```tsx
import { useAppSelector, useAppDispatch } from './hooks';
import { increment, decrement, incrementByAmount } from './counterSlice';

function Counter() {
  const count = useAppSelector((state) => state.counter.value);
  const dispatch = useAppDispatch();

  return (
    <div>
      <span>{count}</span>
      <button onClick={() => dispatch(increment())}>+</button>
      <button onClick={() => dispatch(decrement())}>-</button>
      <button onClick={() => dispatch(incrementByAmount(5))}>+5</button>
    </div>
  );
}
```

## Prepare Callback

```typescript
const todosSlice = createSlice({
  name: 'todos',
  initialState: [] as Todo[],
  reducers: {
    addTodo: {
      reducer: (state, action: PayloadAction<Todo>) => {
        state.push(action.payload);
      },
      prepare: (title: string) => ({
        payload: {
          id: nanoid(),
          title,
          completed: false,
          createdAt: new Date().toISOString(),
        },
      }),
    },
  },
});

// Usage: dispatch(addTodo('Buy milk'))
```

## Extra Reducers

```typescript
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Async thunk
export const fetchUser = createAsyncThunk(
  'user/fetchUser',
  async (userId: string) => {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  }
);

const userSlice = createSlice({
  name: 'user',
  initialState: {
    data: null as User | null,
    loading: false,
    error: null as string | null,
  },
  reducers: {
    clearUser: (state) => {
      state.data = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch';
      });
  },
});
```

## Selectors

```typescript
// In slice file
export const selectCount = (state: RootState) => state.counter.value;
export const selectIsPositive = (state: RootState) => state.counter.value > 0;

// Memoized selector with createSelector
import { createSelector } from '@reduxjs/toolkit';

const selectTodos = (state: RootState) => state.todos.items;
const selectFilter = (state: RootState) => state.todos.filter;

export const selectFilteredTodos = createSelector(
  [selectTodos, selectFilter],
  (todos, filter) => {
    switch (filter) {
      case 'completed':
        return todos.filter(t => t.completed);
      case 'active':
        return todos.filter(t => !t.completed);
      default:
        return todos;
    }
  }
);

// Usage
const filteredTodos = useAppSelector(selectFilteredTodos);
```

## Entity Adapter

```typescript
import { createSlice, createEntityAdapter, PayloadAction } from '@reduxjs/toolkit';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

const todosAdapter = createEntityAdapter<Todo>({
  selectId: (todo) => todo.id,
  sortComparer: (a, b) => a.title.localeCompare(b.title),
});

const todosSlice = createSlice({
  name: 'todos',
  initialState: todosAdapter.getInitialState({
    loading: false,
  }),
  reducers: {
    addTodo: todosAdapter.addOne,
    addTodos: todosAdapter.addMany,
    updateTodo: todosAdapter.updateOne,
    removeTodo: todosAdapter.removeOne,
    setAllTodos: todosAdapter.setAll,
  },
});

// Selectors
export const {
  selectAll: selectAllTodos,
  selectById: selectTodoById,
  selectIds: selectTodoIds,
} = todosAdapter.getSelectors<RootState>((state) => state.todos);
```

**Official docs:** https://redux-toolkit.js.org/api/createSlice
