# React Testing Advanced Patterns

## MSW (Mock Service Worker) Setup

```tsx
// src/test/server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ]);
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 3, ...body }, { status: 201 });
  }),

  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, name: 'John' });
  }),
];

export const server = setupServer(...handlers);

// src/test/setup.ts
import { server } from './server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// In tests - override handlers
it('handles error', async () => {
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.json({ error: 'Server error' }, { status: 500 });
    })
  );

  render(<UserList />);
  await screen.findByText(/error/i);
});
```

---

## Testing Custom Hooks

```tsx
import { renderHook, act } from '@testing-library/react';

function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);
  const increment = () => setCount(c => c + 1);
  const decrement = () => setCount(c => c - 1);
  const reset = () => setCount(initialValue);
  return { count, increment, decrement, reset };
}

describe('useCounter', () => {
  it('starts with initial value', () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });

  it('increments count', () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  it('resets to initial value', () => {
    const { result } = renderHook(() => useCounter(5));

    act(() => {
      result.current.increment();
      result.current.increment();
      result.current.reset();
    });

    expect(result.current.count).toBe(5);
  });
});

// Testing hooks with dependencies
it('refetches when id changes', async () => {
  const { result, rerender } = renderHook(
    ({ id }) => useUser(id),
    { initialProps: { id: '1' } }
  );

  await waitFor(() => {
    expect(result.current.user.name).toBe('User 1');
  });

  rerender({ id: '2' });

  await waitFor(() => {
    expect(result.current.user.name).toBe('User 2');
  });
});
```

---

## Testing Context

```tsx
function renderWithProviders(
  ui: React.ReactElement,
  { preloadedState = {}, ...renderOptions } = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialState={preloadedState.auth}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

it('shows user menu when authenticated', () => {
  renderWithProviders(<Header />, {
    preloadedState: {
      auth: { user: { id: '1', name: 'John' } },
    },
  });

  expect(screen.getByText('John')).toBeInTheDocument();
});
```

---

## Testing Forms

```tsx
describe('LoginForm', () => {
  it('submits with valid data', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('shows validation errors', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={() => {}} />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('disables submit button while submitting', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(() => new Promise(() => {})); // Never resolves

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });
});
```

---

## Accessibility Testing

```tsx
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('Accessibility', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<LoginForm onSubmit={() => {}} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// Manual accessibility assertions
it('has accessible form', () => {
  render(<LoginForm />);

  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeRequired();
  expect(screen.getByRole('alert')).toHaveTextContent(/invalid email/i);
});
```

---

## Snapshot Testing

```tsx
it('matches snapshot', () => {
  const { asFragment } = render(<UserCard user={mockUser} />);
  expect(asFragment()).toMatchSnapshot();
});

// Inline snapshots
it('renders correctly', () => {
  const { container } = render(<Badge>New</Badge>);

  expect(container.firstChild).toMatchInlineSnapshot(`
    <span class="badge badge-primary">
      New
    </span>
  `);
});
```

---

## Test Patterns

### Arrange-Act-Assert

```tsx
it('adds item to cart', async () => {
  // Arrange
  const user = userEvent.setup();
  render(<ProductPage product={mockProduct} />);

  // Act
  await user.click(screen.getByRole('button', { name: /add to cart/i }));

  // Assert
  expect(screen.getByText(/added to cart/i)).toBeInTheDocument();
});
```

### Given-When-Then (BDD)

```tsx
describe('Cart', () => {
  describe('given an empty cart', () => {
    describe('when adding a product', () => {
      it('then shows the product in cart', async () => {
        // ...
      });

      it('then updates the cart count', async () => {
        // ...
      });
    });
  });
});
```
