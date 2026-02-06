# React 19 New Hooks

## useOptimistic

Show optimistic state while async action is pending:

```tsx
import { useOptimistic } from 'react';

interface Message {
  id: string;
  text: string;
  sending?: boolean;
}

function Chat({ messages: serverMessages }: { messages: Message[] }) {
  const [optimisticMessages, addOptimisticMessage] = useOptimistic<
    Message[],
    string
  >(
    serverMessages,
    (state, newMessage) => [
      ...state,
      { id: crypto.randomUUID(), text: newMessage, sending: true }
    ]
  );

  async function sendMessage(formData: FormData) {
    const text = formData.get('message') as string;
    addOptimisticMessage(text);
    await postMessage(text);
  }

  return (
    <div>
      <div className="messages">
        {optimisticMessages.map((message) => (
          <div
            key={message.id}
            className={message.sending ? 'opacity-50' : ''}
          >
            {message.text}
            {message.sending && <span className="ml-2">Sending...</span>}
          </div>
        ))}
      </div>

      <form action={sendMessage}>
        <input name="message" type="text" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### Optimistic Toggle

```tsx
function LikeButton({ liked, postId }: { liked: boolean; postId: string }) {
  const [optimisticLiked, setOptimisticLiked] = useOptimistic(liked);

  async function toggleLike() {
    setOptimisticLiked(!optimisticLiked);
    await updateLike(postId, !liked);
  }

  return (
    <form action={toggleLike}>
      <button type="submit">
        {optimisticLiked ? '❤️' : '🤍'}
      </button>
    </form>
  );
}
```

### Optimistic with Rollback

```tsx
function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, updateOptimisticTodos] = useOptimistic(
    todos,
    (state, { action, todo }: { action: 'add' | 'delete'; todo: Todo }) => {
      switch (action) {
        case 'add':
          return [...state, { ...todo, pending: true }];
        case 'delete':
          return state.filter(t => t.id !== todo.id);
      }
    }
  );

  async function addTodo(formData: FormData) {
    const title = formData.get('title') as string;
    const tempTodo = { id: crypto.randomUUID(), title, completed: false };

    updateOptimisticTodos({ action: 'add', todo: tempTodo });

    try {
      await createTodo(title);
    } catch (error) {
      // Optimistic update will be reverted automatically
      // when server state is reconciled
      showToast('Failed to add todo');
    }
  }

  return (
    <div>
      <form action={addTodo}>
        <input name="title" />
        <button>Add</button>
      </form>
      <ul>
        {optimisticTodos.map(todo => (
          <li key={todo.id} className={todo.pending ? 'opacity-50' : ''}>
            {todo.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## use() Hook

Read resources (Promises, Context) during render:

### Reading Promises

```tsx
import { use, Suspense } from 'react';

// Promise created outside component (important!)
async function fetchUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise); // Suspends until resolved

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}

function UserPage({ userId }: { userId: string }) {
  // Create promise at component level, not in render
  const userPromise = fetchUser(userId);

  return (
    <Suspense fallback={<UserSkeleton />}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  );
}
```

### Reading Context Conditionally

```tsx
import { use, createContext } from 'react';

const ThemeContext = createContext<'light' | 'dark'>('light');

function ThemedButton({ showTheme }: { showTheme: boolean }) {
  // Can be called conditionally!
  if (showTheme) {
    const theme = use(ThemeContext);
    return <button className={theme}>Themed</button>;
  }

  return <button>Default</button>;
}
```

### With Error Handling

```tsx
import { use, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

function DataComponent({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise);
  return <div>{data.content}</div>;
}

function Page() {
  const dataPromise = fetchData();

  return (
    <ErrorBoundary fallback={<ErrorMessage />}>
      <Suspense fallback={<Loading />}>
        <DataComponent dataPromise={dataPromise} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

---

## Ref as Prop (No forwardRef)

React 19 allows passing ref as a regular prop:

```tsx
// Before React 19
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  return <input ref={ref} {...props} />;
});

// React 19
function Input({ ref, ...props }: InputProps & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}

// Usage - same as before
function Form() {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form>
      <Input ref={inputRef} placeholder="Enter text" />
      <button onClick={() => inputRef.current?.focus()}>
        Focus
      </button>
    </form>
  );
}
```

### Cleanup Functions in Refs

```tsx
function VideoPlayer({ src }: { src: string }) {
  return (
    <video
      ref={(element) => {
        if (element) {
          element.play();
        }
        // Cleanup function - called when ref detaches
        return () => {
          element?.pause();
        };
      }}
      src={src}
    />
  );
}
```

---

## Document Metadata

Native support for `<title>`, `<meta>`, and `<link>` anywhere in component tree:

```tsx
function BlogPost({ post }: { post: Post }) {
  return (
    <article>
      {/* These will be hoisted to <head> */}
      <title>{post.title} | My Blog</title>
      <meta name="description" content={post.excerpt} />
      <meta property="og:title" content={post.title} />
      <meta property="og:description" content={post.excerpt} />
      <meta property="og:image" content={post.coverImage} />
      <link rel="canonical" href={`https://myblog.com/posts/${post.slug}`} />

      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  );
}
```

---

## Stylesheet Support

Built-in handling of stylesheets with precedence:

```tsx
function ComponentWithStyles() {
  return (
    <>
      {/* Stylesheets are deduplicated and ordered by precedence */}
      <link
        rel="stylesheet"
        href="/styles/base.css"
        precedence="default"
      />
      <link
        rel="stylesheet"
        href="/styles/component.css"
        precedence="high"
      />

      <div className="styled-component">
        Content with styles
      </div>
    </>
  );
}
```

---

## Async Scripts

Support for async script loading with deduplication:

```tsx
function AnalyticsComponent() {
  return (
    <>
      {/* Scripts are deduplicated even if rendered multiple times */}
      <script async src="https://analytics.example.com/script.js" />

      <div>Analytics enabled</div>
    </>
  );
}

function MapComponent() {
  return (
    <>
      <script
        async
        src="https://maps.googleapis.com/maps/api/js"
        onLoad={() => console.log('Maps loaded')}
        onError={() => console.error('Failed to load maps')}
      />

      <div id="map" />
    </>
  );
}
```
