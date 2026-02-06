---
name: react-testing
description: |
  React component testing with Testing Library and Vitest. Covers unit tests,
  integration tests, async testing, mocking, user events, accessibility testing,
  and test patterns.

  USE WHEN: user mentions "React testing", "Testing Library", "Vitest", "component tests",
  "userEvent", "screen queries", "MSW", asks about "testing React components",
  "mocking in tests", "accessibility testing", "React test patterns"

  DO NOT USE FOR: E2E testing - use Playwright skill instead,
  backend testing - use framework-specific testing skills,
  general testing concepts - use testing framework skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Testing

> **Full Reference**: See [advanced.md](advanced.md) for MSW setup, testing hooks, testing context, forms, accessibility testing, snapshots, and test patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` topic: `testing` for comprehensive documentation.

## Setup with Vitest + Testing Library

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});

// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

---

## Basic Component Testing

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

describe('Button', () => {
  it('renders children', () => {
    render(<Button onClick={() => {}}>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    await userEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button onClick={() => {}} disabled>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

---

## Query Methods

```tsx
// Priority order (prefer accessible queries)
// 1. getByRole - accessible to everyone
screen.getByRole('button', { name: /submit/i });
screen.getByRole('textbox', { name: /email/i });
screen.getByRole('heading', { level: 1 });

// 2. getByLabelText - for form fields
screen.getByLabelText(/email address/i);

// 3. getByPlaceholderText
screen.getByPlaceholderText(/enter your email/i);

// 4. getByText - for non-interactive elements
screen.getByText(/welcome to our app/i);

// 5. getByDisplayValue - for input values
screen.getByDisplayValue(/john@example.com/i);

// 6. getByAltText - for images
screen.getByAltText(/user avatar/i);

// 7. getByTitle
screen.getByTitle(/close/i);

// 8. getByTestId - last resort
screen.getByTestId('custom-element');

// Query variants
screen.getByRole('button');     // Throws if not found
screen.queryByRole('button');   // Returns null if not found
screen.findByRole('button');    // Returns Promise, waits for element
screen.getAllByRole('button');  // Returns array, throws if none
screen.queryAllByRole('button'); // Returns array (possibly empty)
screen.findAllByRole('button'); // Returns Promise of array
```

---

## User Events

```tsx
import userEvent from '@testing-library/user-event';

describe('Form', () => {
  it('submits with user input', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(<LoginForm onSubmit={handleSubmit} />);

    // Type in inputs
    await user.type(screen.getByLabelText(/email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/password/i), 'secret123');

    // Click submit
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      email: 'john@example.com',
      password: 'secret123',
    });
  });

  it('handles keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<Form />);

    // Tab through inputs
    await user.tab();
    expect(screen.getByLabelText(/email/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/password/i)).toHaveFocus();

    // Type and submit with Enter
    await user.type(screen.getByLabelText(/password/i), 'secret{Enter}');
  });

  it('handles select and checkbox', async () => {
    const user = userEvent.setup();
    render(<SettingsForm />);

    // Select option
    await user.selectOptions(screen.getByRole('combobox'), ['dark']);

    // Toggle checkbox
    await user.click(screen.getByRole('checkbox', { name: /notifications/i }));

    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
```

---

## Async Testing

```tsx
describe('UserProfile', () => {
  it('shows loading then user data', async () => {
    render(<UserProfile userId="123" />);

    // Initially shows loading
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Loading is gone
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
});

// Using findBy (combines getBy + waitFor)
it('loads and displays items', async () => {
  render(<ItemList />);

  // findBy waits for element
  const items = await screen.findAllByRole('listitem');
  expect(items).toHaveLength(3);
});

// waitForElementToBeRemoved
it('removes loading indicator', async () => {
  render(<DataLoader />);

  await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));

  expect(screen.getByText('Data loaded')).toBeInTheDocument();
});
```

---

## Mocking

### Mock Functions

```tsx
import { vi } from 'vitest';

const mockFn = vi.fn();
mockFn.mockReturnValue('default');
mockFn.mockReturnValueOnce('first call');
mockFn.mockImplementation((x) => x * 2);
mockFn.mockResolvedValue({ data: [] });
mockFn.mockRejectedValue(new Error('Failed'));

// Assertions
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledTimes(2);
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenLastCalledWith('last arg');
```

### Mock Modules

```tsx
// Mock a module
vi.mock('@/lib/api', () => ({
  fetchUsers: vi.fn(() => Promise.resolve([{ id: 1, name: 'John' }])),
}));

// Import after mocking
import { fetchUsers } from '@/lib/api';

it('fetches users', async () => {
  render(<UserList />);

  expect(fetchUsers).toHaveBeenCalled();
  await screen.findByText('John');
});
```

---

## Common Pitfalls

| Issue | Problem | Solution |
|-------|---------|----------|
| Test not finding element | Element rendered async | Use `findBy` or `waitFor` |
| State not updating | Missing `act()` | Use `userEvent` (handles act) |
| Tests affecting each other | Shared state | Clean up in `afterEach` |
| Flaky tests | Race conditions | Use proper async patterns |

## Best Practices

- Test behavior, not implementation
- Use accessible queries (getByRole)
- Use userEvent over fireEvent
- Test error states
- Use MSW for API mocking
- Don't test implementation details
- Don't test third-party libraries
- Don't overuse snapshots

## When NOT to Use This Skill

- **End-to-end testing** - Use Playwright skill for full E2E flows
- **Backend testing** - Use framework-specific testing skills
- **Performance testing** - Use specialized performance testing tools
- **Visual regression testing** - Use tools like Percy or Chromatic

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Testing implementation details | Brittle tests | Test user-facing behavior |
| Using getByTestId first | Not testing accessibility | Prefer getByRole, getByLabelText |
| Using fireEvent instead of userEvent | Doesn't simulate real user interaction | Use userEvent for realistic tests |
| Not waiting for async updates | Flaky tests | Use findBy or waitFor |
| Snapshot testing everything | Hard to maintain | Use sparingly for stable UI |
| Testing third-party libraries | Wasted effort | Trust library tests, test your integration |
| Not testing error states | Missing edge cases | Test loading, error, empty states |
| Shallow rendering | Missing integration issues | Use full render |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Element not found | Query timing, wrong query | Use findBy for async or check query |
| Test timeout | Async operation not completing | Check waitFor timeout, fix async code |
| Act warning | State update outside act | Use userEvent or wrap in act() |
| Flaky tests | Race conditions, timing | Use proper async queries (findBy, waitFor) |
| Can't test hooks | Testing implementation | Extract to component or use renderHook |
| Mock not working | Mock after import | Mock before importing component |
| Tests affecting each other | Shared state | Clean up in afterEach |

## Reference Documentation

- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest](https://vitest.dev/)
- [MSW](https://mswjs.io/)
- MCP: `mcp__documentation__fetch_docs` → technology: `react`, topic: `testing`
