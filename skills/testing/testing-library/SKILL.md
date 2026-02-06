---
name: testing-library
description: |
  Testing Library for UI testing. Covers queries, user events,
  and async utilities. Use for React/Vue component testing.

  USE WHEN: user mentions "testing library", "react testing", "component test", asks about "screen.getByRole", "userEvent", "render", "fireEvent", "waitFor", "accessibility testing"

  DO NOT USE FOR: E2E tests - use `playwright` or `cypress`; Unit tests - use `vitest` or `jest`; API testing - use framework HTTP clients; Non-UI logic - use unit testing
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Testing Library Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `testing-library` for comprehensive documentation.

## When NOT to Use This Skill

- **E2E Testing** - Use `playwright` or `cypress` for full browser automation
- **Unit Testing** - Use `vitest` or `jest` for isolated function tests
- **API Testing** - Use framework-specific HTTP testing tools
- **Performance Testing** - Use Lighthouse or dedicated performance tools
- **Non-UI Logic** - Test pure functions with unit tests instead

## Basic Test

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserForm } from './UserForm';

test('submits form with user data', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();

  render(<UserForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/name/i), 'John');
  await user.type(screen.getByLabelText(/email/i), 'john@example.com');
  await user.click(screen.getByRole('button', { name: /submit/i }));

  expect(onSubmit).toHaveBeenCalledWith({
    name: 'John',
    email: 'john@example.com',
  });
});
```

## Queries (Priority Order)

```tsx
// 1. Accessible (preferred)
screen.getByRole('button', { name: /submit/i });
screen.getByLabelText(/email/i);
screen.getByPlaceholderText(/search/i);
screen.getByText(/welcome/i);
screen.getByAltText(/logo/i);
screen.getByTitle(/close/i);

// 2. Test IDs (fallback)
screen.getByTestId('submit-button');

// Query variants
getBy...    // Throws if not found
queryBy...  // Returns null if not found
findBy...   // Async, waits for element
getAllBy... // Returns array
```

## User Events

```tsx
const user = userEvent.setup();

await user.click(element);
await user.dblClick(element);
await user.type(input, 'text');
await user.clear(input);
await user.selectOptions(select, 'option1');
await user.keyboard('{Enter}');
await user.hover(element);
await user.tab();
```

## Async Utilities

```tsx
import { waitFor, waitForElementToBeRemoved } from '@testing-library/react';

// Wait for condition
await waitFor(() => {
  expect(screen.getByText(/success/i)).toBeInTheDocument();
});

// Wait for element removal
await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));

// findBy is shorthand for waitFor + getBy
const element = await screen.findByText(/loaded/i);
```

## Custom Render

```tsx
// test-utils.tsx
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {ui}
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export * from '@testing-library/react';
export { renderWithProviders as render };
```

## Production Readiness

### Test Organization

```tsx
// test-utils.tsx - Centralized test setup
import { render, RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

interface WrapperProps {
  children: React.ReactNode;
}

function AllTheProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider>
          {children}
        </RouterProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => ({
  user: userEvent.setup(),
  ...render(ui, { wrapper: AllTheProviders, ...options }),
});

export * from '@testing-library/react';
export { customRender as render };
```

### Accessibility Testing

```tsx
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('form should be accessible', async () => {
  const { container } = render(<LoginForm />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

// Test keyboard navigation
test('should be keyboard navigable', async () => {
  const { user } = render(<Navigation />);

  await user.tab();
  expect(screen.getByRole('link', { name: /home/i })).toHaveFocus();

  await user.tab();
  expect(screen.getByRole('link', { name: /about/i })).toHaveFocus();
});
```

### MSW Integration

```tsx
// mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'John' },
    ]);
  }),
  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 2, ...body }, { status: 201 });
  }),
];

// mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

// setup.ts
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// In tests
test('displays users from API', async () => {
  render(<UserList />);

  expect(await screen.findByText('John')).toBeInTheDocument();
});
```

### Testing Patterns

```tsx
// Test loading states
test('shows loading spinner while fetching', async () => {
  render(<UserProfile userId="1" />);

  expect(screen.getByRole('progressbar')).toBeInTheDocument();
  await waitForElementToBeRemoved(() => screen.queryByRole('progressbar'));
  expect(screen.getByText('John')).toBeInTheDocument();
});

// Test error states
test('shows error message on failure', async () => {
  server.use(
    http.get('/api/users/:id', () => {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    })
  );

  render(<UserProfile userId="999" />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Not found');
});

// Test form validation
test('shows validation errors', async () => {
  const { user } = render(<SignupForm />);

  await user.click(screen.getByRole('button', { name: /submit/i }));

  expect(screen.getByText(/email is required/i)).toBeInTheDocument();
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Component test coverage | > 80% |
| Accessibility violations | 0 |
| Test execution time | < 30s |
| Flaky test rate | 0% |

### Checklist

- [ ] Custom render with providers
- [ ] userEvent.setup() for interactions
- [ ] Accessible queries (getByRole, getByLabelText)
- [ ] Accessibility testing with jest-axe
- [ ] MSW for API mocking
- [ ] Loading/error state tests
- [ ] Keyboard navigation tests
- [ ] Form validation tests
- [ ] No implementation details tested
- [ ] Async operations properly awaited

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using container.querySelector() | Tests implementation, not behavior | Use screen.getByRole, getByLabelText |
| Testing state directly | Brittle, coupled to implementation | Test rendered output, user interactions |
| Using fireEvent over userEvent | Less realistic user interactions | Use userEvent for better simulation |
| Not waiting for async updates | Flaky tests, false failures | Use findBy*, waitFor, or act() |
| Testing CSS classes | Coupled to styling | Test visual behavior or aria attributes |
| Multiple assertions without findBy | Race conditions | Use findBy for elements that appear async |
| Not using data-testid sparingly | Defeats accessibility purpose | Prefer getByRole, use testid as fallback |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "Unable to find element" | Wrong query or element not rendered | Use screen.debug(), check query |
| "Not wrapped in act(...)" | State update not awaited | Use findBy* or waitFor |
| "Unable to find accessible element" | Missing label or role | Add aria-label, role, or label element |
| Test timeout | Async operation not resolving | Check findBy timeout, verify API mock |
| "Multiple elements found" | Non-specific query | Use more specific query or { name } option |
| fireEvent doesn't trigger handler | Wrong event or React version | Use userEvent instead of fireEvent |

## Reference Documentation
- [Queries](quick-ref/queries.md)
- [User Events](quick-ref/user-events.md)
