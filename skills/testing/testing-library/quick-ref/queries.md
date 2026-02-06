# Testing Library Queries Quick Reference

> **Knowledge Base:** Read `knowledge/testing-library/queries.md` for complete documentation.

## Query Priority (Recommended Order)

1. **Accessible to Everyone**: `getByRole`, `getByLabelText`, `getByPlaceholderText`, `getByText`, `getByDisplayValue`
2. **Semantic Queries**: `getByAltText`, `getByTitle`
3. **Test IDs**: `getByTestId` (escape hatch)

## Query Types

```javascript
// getBy - throws if not found (synchronous)
const button = screen.getByRole('button');

// queryBy - returns null if not found (for asserting absence)
const modal = screen.queryByRole('dialog');
expect(modal).not.toBeInTheDocument();

// findBy - returns promise, waits for element (async)
const message = await screen.findByText('Success');

// getAllBy/queryAllBy/findAllBy - return arrays
const items = screen.getAllByRole('listitem');
```

## getByRole

```javascript
// Most common roles
screen.getByRole('button');
screen.getByRole('link');
screen.getByRole('heading');
screen.getByRole('textbox');           // input[type="text"], textarea
screen.getByRole('checkbox');
screen.getByRole('radio');
screen.getByRole('combobox');          // select
screen.getByRole('list');
screen.getByRole('listitem');
screen.getByRole('navigation');
screen.getByRole('dialog');
screen.getByRole('alert');
screen.getByRole('img');

// With accessible name
screen.getByRole('button', { name: 'Submit' });
screen.getByRole('button', { name: /submit/i });

// Heading level
screen.getByRole('heading', { level: 1 });
screen.getByRole('heading', { name: 'Title', level: 2 });

// State queries
screen.getByRole('checkbox', { checked: true });
screen.getByRole('button', { pressed: true });
screen.getByRole('textbox', { expanded: true });
```

## getByLabelText

```javascript
// <label for="email">Email</label>
// <input id="email" />
screen.getByLabelText('Email');

// <label>Email <input /></label>
screen.getByLabelText('Email');

// aria-label
// <input aria-label="Search" />
screen.getByLabelText('Search');

// aria-labelledby
// <span id="label">Username</span>
// <input aria-labelledby="label" />
screen.getByLabelText('Username');

// With selector for multiple inputs
screen.getByLabelText('Email', { selector: 'input' });
```

## getByText

```javascript
// Exact match
screen.getByText('Hello World');

// Case-insensitive regex
screen.getByText(/hello world/i);

// Partial match
screen.getByText(/hello/i);

// Function matcher
screen.getByText((content, element) => {
  return element.tagName === 'P' && content.includes('hello');
});

// Options
screen.getByText('Submit', { exact: false });  // Partial match
screen.getByText('Submit', { selector: 'button' });
```

## Other Queries

```javascript
// getByPlaceholderText
screen.getByPlaceholderText('Enter email');

// getByDisplayValue (current value of input)
screen.getByDisplayValue('current value');

// getByAltText (for images)
screen.getByAltText('Company Logo');

// getByTitle
screen.getByTitle('Close');

// getByTestId (escape hatch)
screen.getByTestId('custom-element');
// <div data-testid="custom-element" />
```

## within - Scoped Queries

```javascript
// Query within a container
const form = screen.getByRole('form');
const submitButton = within(form).getByRole('button', { name: 'Submit' });

// Query within list item
const items = screen.getAllByRole('listitem');
within(items[0]).getByText('First item');
```

## Async Queries

```javascript
// Wait for element to appear
const message = await screen.findByText('Success');

// Custom timeout
const element = await screen.findByRole('alert', {}, { timeout: 5000 });

// waitFor - wait for expectation
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// waitForElementToBeRemoved
await waitForElementToBeRemoved(() => screen.queryByText('Loading'));
```

## Debug

```javascript
// Print DOM tree
screen.debug();

// Debug specific element
screen.debug(screen.getByRole('form'));

// Log testing playground URL
screen.logTestingPlaygroundURL();

// Pretty DOM
import { prettyDOM } from '@testing-library/dom';
console.log(prettyDOM(element));
```

**Official docs:** https://testing-library.com/docs/queries/about
