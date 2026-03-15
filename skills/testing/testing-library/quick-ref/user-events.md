# Testing Library User Events Quick Reference

> **Knowledge Base:** Read `knowledge/testing-library/user-events.md` for complete documentation.

## Setup

```javascript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Setup user event instance (recommended)
test('example', async () => {
  const user = userEvent.setup();
  render(<MyComponent />);

  await user.click(screen.getByRole('button'));
});
```

## Click Events

```javascript
const user = userEvent.setup();

// Single click
await user.click(screen.getByRole('button'));

// Double click
await user.dblClick(screen.getByRole('button'));

// Right click
await user.pointer({ keys: '[MouseRight]', target: element });

// Click options
await user.click(element, { skipHover: true });

// Triple click (select all text)
await user.tripleClick(screen.getByRole('textbox'));
```

## Typing

```javascript
const user = userEvent.setup();

// Type text
await user.type(screen.getByRole('textbox'), 'Hello World');

// Type with delay between keystrokes
await user.type(input, 'text', { delay: 100 });

// Clear and type
await user.clear(screen.getByRole('textbox'));
await user.type(screen.getByRole('textbox'), 'New text');

// Special keys
await user.type(input, '{Enter}');
await user.type(input, '{Escape}');
await user.type(input, '{Backspace}');
await user.type(input, '{Delete}');
await user.type(input, '{Tab}');
await user.type(input, '{ArrowLeft}');
await user.type(input, '{ArrowRight}');
await user.type(input, '{ArrowUp}');
await user.type(input, '{ArrowDown}');
await user.type(input, '{Home}');
await user.type(input, '{End}');

// Modifier keys
await user.type(input, '{Shift>}ABC{/Shift}');  // Hold shift
await user.type(input, '{Control>}a{/Control}'); // Ctrl+A
await user.type(input, '{Meta>}c{/Meta}');       // Cmd+C

// Select all and replace
await user.type(input, '{Control>}a{/Control}new text');
```

## Keyboard

```javascript
const user = userEvent.setup();

// Single key press
await user.keyboard('a');
await user.keyboard('{Enter}');

// Multiple keys
await user.keyboard('abc');
await user.keyboard('{Shift>}ABC{/Shift}');

// Tab navigation
await user.tab();
await user.tab({ shift: true });  // Shift+Tab
```

## Selection

```javascript
const user = userEvent.setup();

// Select from dropdown
await user.selectOptions(
  screen.getByRole('combobox'),
  'option-value'
);

// Select by display text
await user.selectOptions(
  screen.getByRole('combobox'),
  screen.getByRole('option', { name: 'Option Text' })
);

// Multi-select
await user.selectOptions(
  screen.getByRole('listbox'),
  ['value1', 'value2']
);

// Deselect
await user.deselectOptions(
  screen.getByRole('listbox'),
  'value1'
);

// Checkbox
await user.click(screen.getByRole('checkbox'));

// Radio button
await user.click(screen.getByRole('radio', { name: 'Option A' }));
```

## Hover

```javascript
const user = userEvent.setup();

// Hover over element
await user.hover(screen.getByRole('button'));

// Unhover
await user.unhover(screen.getByRole('button'));
```

## Clipboard

```javascript
const user = userEvent.setup();

// Copy
await user.click(input);
await user.keyboard('{Control>}c{/Control}');

// Paste
await user.click(anotherInput);
await user.paste('Pasted text');

// Cut
await user.keyboard('{Control>}x{/Control}');
```

## Upload Files

```javascript
const user = userEvent.setup();

const file = new File(['hello'], 'hello.png', { type: 'image/png' });

const input = screen.getByLabelText('Upload');
await user.upload(input, file);

expect(input.files[0]).toBe(file);
expect(input.files).toHaveLength(1);

// Multiple files
const files = [
  new File(['hello'], 'hello.png', { type: 'image/png' }),
  new File(['world'], 'world.png', { type: 'image/png' })
];
await user.upload(input, files);
```

## Pointer Events

```javascript
const user = userEvent.setup();

// Drag and drop (basic)
await user.pointer([
  { keys: '[MouseLeft>]', target: dragElement },
  { target: dropZone },
  { keys: '[/MouseLeft]' }
]);

// Touch events
await user.pointer({ keys: '[TouchA]', target: element });
```

## Complete Example

```javascript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from './LoginForm';

test('submits form with user credentials', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();

  render(<LoginForm onSubmit={onSubmit} />);

  // Fill form
  await user.type(screen.getByLabelText('Email'), 'user@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');

  // Submit
  await user.click(screen.getByRole('button', { name: 'Login' }));

  // Assertions
  expect(onSubmit).toHaveBeenCalledWith({
    email: 'user@example.com',
    password: 'password123'
  });
});
```

**Official docs:** https://testing-library.com/docs/user-event/intro
