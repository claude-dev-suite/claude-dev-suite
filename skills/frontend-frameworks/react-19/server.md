# Server Components & Server Actions

## Server Components Pattern

```tsx
// app/users/page.tsx (Server Component by default)
import { Suspense } from 'react';
import { UserList } from './user-list';
import { UserListSkeleton } from './user-list-skeleton';

export default async function UsersPage() {
  // Fetch directly in Server Component
  const users = await fetchUsers();

  return (
    <div>
      <h1>Users</h1>
      <Suspense fallback={<UserListSkeleton />}>
        <UserList users={users} />
      </Suspense>
    </div>
  );
}

// app/users/user-list.tsx (Server Component)
import { UserCard } from './user-card';

export function UserList({ users }: { users: User[] }) {
  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>
          <UserCard user={user} />
        </li>
      ))}
    </ul>
  );
}

// app/users/user-card.tsx
'use client'; // Client Component for interactivity

import { useState } from 'react';

export function UserCard({ user }: { user: User }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div onClick={() => setExpanded(!expanded)}>
      <h2>{user.name}</h2>
      {expanded && <p>{user.bio}</p>}
    </div>
  );
}
```

---

## Server Actions

```tsx
// app/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;

  // Validation
  if (!title || title.length < 3) {
    return { error: 'Title must be at least 3 characters' };
  }

  // Database operation
  const post = await db.post.create({
    data: { title, content }
  });

  // Revalidate cached data
  revalidatePath('/posts');

  // Redirect
  redirect(`/posts/${post.id}`);
}

export async function deletePost(id: string) {
  await db.post.delete({ where: { id } });
  revalidatePath('/posts');
}

// app/posts/new/page.tsx
import { createPost } from '../actions';

export default function NewPostPage() {
  return (
    <form action={createPost}>
      <input name="title" placeholder="Title" required />
      <textarea name="content" placeholder="Content" required />
      <button type="submit">Create Post</button>
    </form>
  );
}
```

---

## Server Action with Client Validation

```tsx
'use client';

import { useActionState } from 'react';
import { createPost } from './actions';

function CreatePostForm() {
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      // Client-side validation first
      const title = formData.get('title') as string;
      if (title.length < 3) {
        return { error: 'Title too short' };
      }

      // Then call server action
      return createPost(formData);
    },
    null
  );

  return (
    <form action={formAction}>
      <input name="title" />
      {state?.error && <p className="error">{state.error}</p>}
      <button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </button>
    </form>
  );
}
```

---

## React Compiler (React Forget)

Automatic memoization - no more manual `useMemo`, `useCallback`, `memo`:

```tsx
// Before: Manual memoization
const MemoizedComponent = memo(function Component({ items }) {
  const sortedItems = useMemo(
    () => items.sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );

  const handleClick = useCallback((id) => {
    console.log('Clicked', id);
  }, []);

  return (
    <ul>
      {sortedItems.map(item => (
        <li key={item.id} onClick={() => handleClick(item.id)}>
          {item.name}
        </li>
      ))}
    </ul>
  );
});

// After: React Compiler handles it automatically
function Component({ items }) {
  const sortedItems = items.sort((a, b) => a.name.localeCompare(b.name));

  const handleClick = (id) => {
    console.log('Clicked', id);
  };

  return (
    <ul>
      {sortedItems.map(item => (
        <li key={item.id} onClick={() => handleClick(item.id)}>
          {item.name}
        </li>
      ))}
    </ul>
  );
}
```

### Enabling React Compiler

```js
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-react-compiler', {
      // Options
    }]
  ]
};

// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler']
      }
    })
  ]
});
```

---

## Error Handling Improvements

Better error messages and `onCaughtError` / `onUncaughtError`:

```tsx
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root')!, {
  onCaughtError(error, errorInfo) {
    // Error caught by Error Boundary
    console.error('Caught error:', error);
    console.error('Component stack:', errorInfo.componentStack);
    logErrorToService(error, errorInfo);
  },
  onUncaughtError(error, errorInfo) {
    // Error not caught - will crash the app
    console.error('Uncaught error:', error);
    logCriticalError(error, errorInfo);
  },
  onRecoverableError(error, errorInfo) {
    // Error React recovered from (hydration mismatch, etc.)
    console.warn('Recoverable error:', error);
  }
});

root.render(<App />);
```

---

## Migration Guide

### From React 18 to 19

```tsx
// 1. Replace useFormState with useActionState
// Before
import { useFormState } from 'react-dom';
const [state, formAction] = useFormState(action, initialState);

// After
import { useActionState } from 'react';
const [state, formAction, isPending] = useActionState(action, initialState);

// 2. Remove forwardRef (optional)
// Before
const Input = forwardRef((props, ref) => <input ref={ref} {...props} />);

// After
function Input({ ref, ...props }) {
  return <input ref={ref} {...props} />;
}

// 3. Context default value
// Before
const ctx = useContext(MyContext); // Could be undefined

// After
const ctx = use(MyContext); // Throws if no provider (in React 19)

// 4. Cleanup ref callbacks
// Before (had to handle cleanup separately)
useEffect(() => {
  return () => cleanup();
}, []);

// After
<div ref={(el) => {
  setup(el);
  return () => cleanup(el);
}} />
```
