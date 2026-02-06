# shadcn/ui Advanced Patterns

## Accessibility Patterns

```tsx
// All shadcn/ui components are built on Radix primitives with accessibility
// Ensure proper usage:

// Dialog with proper focus management
<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Accessible Title</DialogTitle>
      <DialogDescription>
        Description for screen readers
      </DialogDescription>
    </DialogHeader>
    {/* Content */}
  </DialogContent>
</Dialog>

// Form fields with labels
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    placeholder="Enter email"
    aria-describedby="email-error"
  />
  {error && (
    <p id="email-error" className="text-sm text-destructive">
      {error}
    </p>
  )}
</div>

// Loading states with announcements
<Button disabled={isLoading} aria-busy={isLoading}>
  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
  <span>{isLoading ? 'Saving...' : 'Save'}</span>
</Button>
```

---

## Virtualized Tables

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualTable({ data }: { data: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });

  return (
    <div ref={parentRef} className="h-[400px] overflow-auto">
      <Table>
        <TableBody style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <TableRow
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: virtualRow.start,
                height: virtualRow.size,
              }}
            >
              <TableCell>{data[virtualRow.index].name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

## Form Integration

```tsx
// With react-hook-form and zod
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const formSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().min(2, 'Name too short'),
});

type FormData = z.infer<typeof formSchema>;

function UserForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', name: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="email@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Submit
        </Button>
      </form>
    </Form>
  );
}
```

---

## Component Testing

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogTrigger } from './dialog';

describe('Dialog', () => {
  it('opens on trigger click', async () => {
    const user = userEvent.setup();

    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <p>Content</p>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByText('Open'));
    await waitFor(() => {
      expect(screen.getByText('Content')).toBeVisible();
    });
  });

  it('closes on escape key', async () => {
    const user = userEvent.setup();

    render(
      <Dialog defaultOpen>
        <DialogContent>Content</DialogContent>
      </Dialog>
    );

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });
  });
});

// Accessibility testing
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

it('has no accessibility violations', async () => {
  const { container } = render(<UserForm />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

## Dark Mode

```tsx
// Theme provider setup
import { ThemeProvider } from 'next-themes';

function App({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

// Theme toggle
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

---

## Lazy Loading Components

```tsx
// Lazy load heavy components
const DataTable = lazy(() => import('./data-table'));
const Chart = lazy(() => import('./chart'));

function Dashboard() {
  return (
    <Suspense fallback={<Skeleton className="h-[400px]" />}>
      <DataTable data={data} />
    </Suspense>
  );
}
```
