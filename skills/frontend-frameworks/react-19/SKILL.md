---
name: react-19
description: |
  React 19 new features and APIs. Covers Actions, useActionState, useFormStatus,
  useOptimistic, use() hook, Server Components, Server Actions, improved ref handling,
  document metadata, and new compiler.

  USE WHEN: user mentions "React 19", "useActionState", "useFormStatus", "useOptimistic",
  "use() hook", "Server Components", "Server Actions", "React Compiler", asks about
  "React 19 features", "Actions in React", "ref as prop"

  DO NOT USE FOR: React 18 and earlier - use `react` skill instead,
  forms in general - use `react-forms` or `react-hook-form` skills instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React 19

## Overview of New Features

| Feature | Description |
|---------|-------------|
| Actions | Async functions in transitions for data mutations |
| `useActionState` | Handle action state with pending/error |
| `useFormStatus` | Access parent form status |
| `useOptimistic` | Optimistic UI updates |
| `use()` | Read resources in render (Promises, Context) |
| Server Components | Components that render on server |
| Server Actions | Server functions called from client |
| React Compiler | Automatic memoization |
| Ref as prop | Pass ref directly without forwardRef |

---

## Actions

Actions are async functions used in transitions to handle mutations:

```tsx
import { useTransition } from 'react';

function UpdateProfile() {
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result.error) {
        showToast(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit}>
      <input name="name" type="text" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
```

---

## useActionState

Replaces the experimental `useFormState`. Manages form action state including pending status:

```tsx
import { useActionState } from 'react';

interface FormState {
  message: string | null;
  errors: Record<string, string[]>;
}

async function createPost(prevState: FormState, formData: FormData): Promise<FormState> {
  const title = formData.get('title') as string;

  if (!title || title.length < 3) {
    return { message: null, errors: { title: ['Title must be at least 3 characters'] } };
  }

  try {
    await savePost({ title });
    return { message: 'Post created!', errors: {} };
  } catch (error) {
    return { message: 'Failed to create post', errors: {} };
  }
}

function CreatePostForm() {
  const [state, formAction, isPending] = useActionState(createPost, {
    message: null,
    errors: {}
  });

  return (
    <form action={formAction}>
      <input name="title" type="text" />
      {state.errors.title && <p className="error">{state.errors.title[0]}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  );
}
```

---

## useFormStatus

Access the status of a parent `<form>` from any child component:

```tsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending, data, method, action } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Submitting...' : 'Submit'}
    </button>
  );
}

// Usage - must be child of <form>
function ContactForm() {
  return (
    <form action={submitContact}>
      <input name="email" type="email" required />
      <SubmitButton />
    </form>
  );
}
```

### Reusable Form Components

```tsx
'use client';
import { useFormStatus } from 'react-dom';

export function FormButton({ children, pendingText = 'Submitting...', ...props }) {
  const { pending } = useFormStatus();

  return (
    <button {...props} disabled={pending || props.disabled}>
      {pending ? pendingText : children}
    </button>
  );
}
```

> **Full Reference**: See [hooks.md](hooks.md) for useOptimistic, use() hook, Ref handling, Document Metadata.

---

## Server Components & Server Actions

```tsx
// app/users/page.tsx (Server Component by default)
export default async function UsersPage() {
  const users = await fetchUsers();
  return <UserList users={users} />;
}

// app/actions.ts
'use server';
export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  await db.post.create({ data: { title } });
  revalidatePath('/posts');
  redirect(`/posts`);
}
```

> **Full Reference**: See [server.md](server.md) for Server Components patterns, React Compiler, Migration Guide.

---

## Best Practices

- ✅ Use Actions for form submissions and mutations
- ✅ Use `useOptimistic` for immediate feedback
- ✅ Use `use()` instead of useEffect for data fetching
- ✅ Let React Compiler handle memoization
- ✅ Use Server Components for static content
- ✅ Use Server Actions for secure mutations
- ❌ Don't create Promises inside components for `use()`
- ❌ Don't mix client/server code without proper boundaries

---

## When NOT to Use This Skill

- **React 18 and earlier features** - Use `react` skill instead
- **General form handling** - Use `react-forms` or `react-hook-form` skills
- **Performance optimization** - Use `react-performance` skill

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Creating Promises in render for use() | New promise every render | Create promise outside component |
| Using useFormState instead of useActionState | Deprecated in React 19 | Use useActionState with isPending |
| Missing 'use server' directive | Code runs on client | Add 'use server' at top of file |
| Not validating Server Action inputs | Security vulnerability | Always validate with Zod |

---

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Action not working | Missing action attribute | Add action={serverAction} to form |
| isPending not available | Using old useFormState | Switch to useActionState |
| Serialization errors | Passing functions/classes | Only pass serializable data |
| ref not working | Using old forwardRef pattern | Pass ref as regular prop |

---

## Reference Files

| File | Content |
|------|---------|
| [hooks.md](hooks.md) | useOptimistic, use(), Ref handling, Metadata |
| [server.md](server.md) | Server Components, Server Actions, Compiler, Migration |

---

## External Documentation

- [React 19 Blog](https://react.dev/blog/2024/12/05/react-19)
- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
