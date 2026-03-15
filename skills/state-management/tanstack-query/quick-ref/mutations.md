# TanStack Query - Mutations Quick Reference

> **Knowledge Base:** Read `knowledge/tanstack-query/mutations.md` for complete documentation.

## useMutation

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function CreateTodo() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newTodo) => {
      return fetch('/api/todos', {
        method: 'POST',
        body: JSON.stringify(newTodo),
      }).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate({ title: 'New Todo' })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Creating...' : 'Create Todo'}
    </button>
  );
}
```

## Mutation States

```tsx
const {
  mutate,           // Trigger mutation
  mutateAsync,      // Returns promise
  data,             // Response data
  error,            // Error object
  isPending,        // Loading state (was isLoading)
  isError,          // Error state
  isSuccess,        // Success state
  isIdle,           // Not yet triggered
  reset,            // Reset mutation state
} = useMutation({ mutationFn });

// Usage
mutation.mutate(variables, {
  onSuccess: (data) => console.log('Success!', data),
  onError: (error) => console.log('Error!', error),
  onSettled: () => console.log('Done!'),
});

// With async/await
const handleSubmit = async () => {
  try {
    const data = await mutation.mutateAsync(variables);
    console.log('Success:', data);
  } catch (error) {
    console.log('Error:', error);
  }
};
```

## Mutation Callbacks

```tsx
const mutation = useMutation({
  mutationFn: updateTodo,

  // Called before mutation
  onMutate: async (variables) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['todos'] });

    // Snapshot previous value
    const previousTodos = queryClient.getQueryData(['todos']);

    // Optimistically update
    queryClient.setQueryData(['todos'], old => [...old, variables]);

    // Return context for rollback
    return { previousTodos };
  },

  // Called on error
  onError: (error, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(['todos'], context.previousTodos);
  },

  // Called on success
  onSuccess: (data, variables, context) => {
    console.log('Todo created:', data);
  },

  // Called on both success and error
  onSettled: (data, error, variables, context) => {
    // Refetch after mutation
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});
```

## Optimistic Updates

```tsx
const mutation = useMutation({
  mutationFn: updateTodo,
  onMutate: async (newTodo) => {
    // Cancel refetches to avoid overwriting optimistic update
    await queryClient.cancelQueries({ queryKey: ['todos', newTodo.id] });

    // Snapshot
    const previousTodo = queryClient.getQueryData(['todos', newTodo.id]);

    // Optimistic update
    queryClient.setQueryData(['todos', newTodo.id], newTodo);

    return { previousTodo };
  },
  onError: (err, newTodo, context) => {
    // Rollback
    queryClient.setQueryData(['todos', newTodo.id], context.previousTodo);
  },
  onSettled: (data, error, variables) => {
    // Sync with server
    queryClient.invalidateQueries({ queryKey: ['todos', variables.id] });
  },
});
```

## Optimistic Updates for Lists

```tsx
const mutation = useMutation({
  mutationFn: deleteTodo,
  onMutate: async (todoId) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] });

    const previousTodos = queryClient.getQueryData(['todos']);

    // Remove from list optimistically
    queryClient.setQueryData(['todos'], (old) =>
      old.filter(todo => todo.id !== todoId)
    );

    return { previousTodos };
  },
  onError: (err, todoId, context) => {
    queryClient.setQueryData(['todos'], context.previousTodos);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});
```

## Form Integration

```tsx
function TodoForm() {
  const [title, setTitle] = useState('');
  const queryClient = useQueryClient();

  const createTodo = useMutation({
    mutationFn: (newTodo) => api.createTodo(newTodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setTitle(''); // Reset form
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createTodo.mutate({ title });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={createTodo.isPending}
      />
      <button type="submit" disabled={createTodo.isPending}>
        {createTodo.isPending ? 'Creating...' : 'Create'}
      </button>
      {createTodo.isError && (
        <p className="error">{createTodo.error.message}</p>
      )}
    </form>
  );
}
```

## Multiple Mutations

```tsx
// Batch mutations
async function batchUpdate(items) {
  const mutations = items.map(item =>
    mutation.mutateAsync(item)
  );
  await Promise.all(mutations);
  queryClient.invalidateQueries({ queryKey: ['items'] });
}

// Sequential mutations
async function sequentialUpdate(items) {
  for (const item of items) {
    await mutation.mutateAsync(item);
  }
  queryClient.invalidateQueries({ queryKey: ['items'] });
}
```

## Retry Configuration

```tsx
const mutation = useMutation({
  mutationFn: updateTodo,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});
```

## Global Mutation Defaults

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: 3,
      onError: (error) => {
        toast.error(`Error: ${error.message}`);
      },
    },
  },
});
```

**Official docs:** https://tanstack.com/query/latest/docs/react/guides/mutations
