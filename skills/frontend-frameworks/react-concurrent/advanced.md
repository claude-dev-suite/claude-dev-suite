# React Concurrent Advanced Patterns

## Keep Previous Content During Loading

```tsx
function Gallery({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div className={isStale ? 'opacity-50 transition-opacity' : ''}>
      <Suspense fallback={<Skeleton />}>
        {/* Show old results while new ones load */}
        <SearchResults query={deferredQuery} />
      </Suspense>
    </div>
  );
}
```

---

## Priority-Based Updates

```tsx
function Dashboard() {
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState<Data[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleFilterChange = (newFilter: string) => {
    // High priority: UI feedback
    setFilter(newFilter);

    // Low priority: Data processing
    startTransition(() => {
      const filtered = processLargeDataset(rawData, newFilter);
      setData(filtered);
    });
  };

  return (
    <div>
      <FilterButtons
        selected={filter}
        onChange={handleFilterChange}
      />

      {isPending ? (
        <div className="overlay">
          <Spinner />
        </div>
      ) : null}

      <DataGrid data={data} />
    </div>
  );
}
```

---

## Optimistic Updates with Transitions

```tsx
function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isPending, startTransition] = useTransition();

  const addTodo = async (text: string) => {
    // Optimistic update
    const optimisticTodo = { id: Date.now(), text, completed: false };

    startTransition(() => {
      setTodos(prev => [...prev, optimisticTodo]);
    });

    try {
      const savedTodo = await saveTodo(text);
      startTransition(() => {
        setTodos(prev =>
          prev.map(t => t.id === optimisticTodo.id ? savedTodo : t)
        );
      });
    } catch (error) {
      // Rollback
      startTransition(() => {
        setTodos(prev => prev.filter(t => t.id !== optimisticTodo.id));
      });
    }
  };

  return (
    <div>
      <AddTodoForm onAdd={addTodo} disabled={isPending} />
      <TodoItems todos={todos} />
    </div>
  );
}
```

---

## Router with Transitions

```tsx
import { useNavigate } from 'react-router-dom';

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    startTransition(() => {
      navigate(to);
    });
  };

  return (
    <a
      href={to}
      onClick={handleClick}
      className={isPending ? 'opacity-50' : ''}
    >
      {children}
      {isPending && <Spinner size="small" />}
    </a>
  );
}
```

---

## Form Actions with Transitions

```tsx
function CommentForm({ postId }: { postId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    const text = formData.get('comment') as string;

    startTransition(async () => {
      const newComment = await submitComment(postId, text);
      setComments(prev => [...prev, newComment]);
    });
  };

  return (
    <div>
      <CommentList comments={comments} />

      <form action={handleSubmit}>
        <textarea name="comment" required />
        <button type="submit" disabled={isPending}>
          {isPending ? 'Posting...' : 'Post Comment'}
        </button>
      </form>
    </div>
  );
}
```

---

## Combine with memo for Performance

```tsx
// useDeferredValue only helps if the component is memoized
const ExpensiveComponent = memo(function ExpensiveComponent({ value }: Props) {
  // Expensive render...
});

function Parent({ value }) {
  const deferredValue = useDeferredValue(value);

  return <ExpensiveComponent value={deferredValue} />;
}
```

---

## Debugging Concurrent Renders

```tsx
// React DevTools shows concurrent renders
// Look for "Suspended" and "Pending" states in Components tab

// Log to understand timing
function DebugComponent() {
  console.log('Rendering...');

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    console.log('isPending:', isPending);
  }, [isPending]);

  return <div />;
}
```

---

## Heavy Component Pattern

```tsx
// ❌ Unnecessary - simple components don't need this
function SimpleComponent() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    startTransition(() => {
      setCount(c => c + 1); // This is already fast!
    });
  };
}

// ✅ Necessary - heavy computation or large lists
function HeavyComponent() {
  const [filter, setFilter] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleFilter = (value: string) => {
    startTransition(() => {
      setFilter(value);
      // Triggers re-render of 10,000 items
    });
  };
}
```
