# Remix Forms & Actions

> **Knowledge Base:** Read `knowledge/remix/forms.md` for complete documentation.

## Basic Form with Action

```tsx
// routes/contact.tsx
import { Form, useActionData } from '@remix-run/react';
import type { ActionFunctionArgs } from '@remix-run/node';
import { redirect } from '@remix-run/node';

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get('email');
  const message = formData.get('message');

  const errors: Record<string, string> = {};
  if (!email) errors.email = 'Email required';
  if (!message) errors.message = 'Message required';

  if (Object.keys(errors).length) {
    return { errors };
  }

  await sendMessage({ email, message });
  return redirect('/thank-you');
}

export default function Contact() {
  const actionData = useActionData<typeof action>();

  return (
    <Form method="post">
      <input type="email" name="email" />
      {actionData?.errors?.email && <p>{actionData.errors.email}</p>}

      <textarea name="message" />
      {actionData?.errors?.message && <p>{actionData.errors.message}</p>}

      <button type="submit">Send</button>
    </Form>
  );
}
```

## Multiple Actions (Intent)

```tsx
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent');

  switch (intent) {
    case 'delete':
      await deleteItem(formData.get('id'));
      break;
    case 'update':
      await updateItem(formData.get('id'), formData.get('name'));
      break;
  }

  return null;
}

export default function Items() {
  return (
    <>
      <Form method="post">
        <input type="hidden" name="id" value="123" />
        <button name="intent" value="delete">Delete</button>
      </Form>

      <Form method="post">
        <input type="hidden" name="id" value="123" />
        <input name="name" defaultValue="Item" />
        <button name="intent" value="update">Update</button>
      </Form>
    </>
  );
}
```

## useFetcher (No Navigation)

```tsx
import { useFetcher } from '@remix-run/react';

export default function Newsletter() {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state === 'submitting';

  return (
    <fetcher.Form method="post" action="/api/subscribe">
      <input type="email" name="email" disabled={isSubmitting} />
      <button disabled={isSubmitting}>
        {isSubmitting ? 'Subscribing...' : 'Subscribe'}
      </button>
      {fetcher.data?.success && <p>Thanks for subscribing!</p>}
    </fetcher.Form>
  );
}
```

## Optimistic UI

```tsx
export default function TodoList() {
  const fetcher = useFetcher();

  // Optimistic: show as done immediately
  const optimisticDone = fetcher.formData
    ? fetcher.formData.get('done') === 'true'
    : todo.done;

  return (
    <fetcher.Form method="post">
      <input
        type="checkbox"
        name="done"
        checked={optimisticDone}
        onChange={(e) => fetcher.submit(e.currentTarget.form)}
      />
    </fetcher.Form>
  );
}
```

## File Uploads

```tsx
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  // Upload to storage
  const url = await uploadFile(file);
  return { url };
}

export default function Upload() {
  return (
    <Form method="post" encType="multipart/form-data">
      <input type="file" name="file" />
      <button type="submit">Upload</button>
    </Form>
  );
}
```

## Progressive Enhancement

```tsx
import { useNavigation } from '@remix-run/react';

export default function SearchForm() {
  const navigation = useNavigation();
  const isSearching = navigation.state === 'submitting';

  return (
    <Form method="get" action="/search">
      <input type="search" name="q" />
      <button disabled={isSearching}>
        {isSearching ? 'Searching...' : 'Search'}
      </button>
    </Form>
  );
}
```

**Official docs:** https://remix.run/docs/en/main/guides/data-writes
