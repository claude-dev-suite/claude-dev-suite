---
name: react-hook-form
description: |
  React Hook Form with Zod validation. Covers form setup, validation schemas,
  field components, error handling, and submission with shadcn/ui integration.

  USE WHEN: user mentions "React Hook Form", "RHF", "Zod validation", "shadcn/ui forms",
  "zodResolver", "FormField", asks about "form validation with Zod", "shadcn form components"

  DO NOT USE FOR: React 19 Server Actions - use `react-19` skill instead,
  basic form handling - use `react-forms` skill instead,
  controlled/uncontrolled patterns - use `react-forms` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Hook Form with Zod

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react-hook-form` for comprehensive documentation on React Hook Form integration with Zod and shadcn/ui.

## Form Setup

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginForm() {
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    await login(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* fields */}
    </form>
  );
}
```

## With shadcn/ui Form Components

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function LoginForm() {
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
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

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Loading...' : 'Login'}
        </Button>
      </form>
    </Form>
  );
}
```

## Complex Validation Schema

```tsx
const userSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Invalid email'),
  role: z.enum(['admin', 'user', 'manager'], {
    errorMap: () => ({ message: 'Select a valid role' }),
  }),
  department: z.string().optional(),
  startDate: z.date({
    required_error: 'Start date is required',
  }),
  salary: z.number()
    .min(0, 'Salary must be positive')
    .optional(),
});

// Conditional validation
const formSchema = z.object({
  hasAddress: z.boolean(),
  address: z.string().optional(),
}).refine(
  (data) => !data.hasAddress || data.address,
  { message: 'Address is required', path: ['address'] }
);
```

## Select Field

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

<FormField
  control={form.control}
  name="role"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Role</FormLabel>
      <Select onValueChange={field.onChange} defaultValue={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="manager">Manager</SelectItem>
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>
```

## Date Picker Field

```tsx
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

<FormField
  control={form.control}
  name="startDate"
  render={({ field }) => (
    <FormItem className="flex flex-col">
      <FormLabel>Start Date</FormLabel>
      <Popover>
        <PopoverTrigger asChild>
          <FormControl>
            <Button variant="outline" className="w-full justify-start text-left">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {field.value ? format(field.value, 'PPP') : 'Pick a date'}
            </Button>
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={field.value}
            onSelect={field.onChange}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      <FormMessage />
    </FormItem>
  )}
/>
```

## Form with API Mutation

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function UserForm({ userId }: { userId?: string }) {
  const queryClient = useQueryClient();
  const isEditing = !!userId;

  const mutation = useMutation({
    mutationFn: isEditing ? usersApi.update : usersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(isEditing ? 'User updated' : 'User created');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (data: UserFormData) => {
    if (isEditing) {
      mutation.mutate({ id: userId, ...data });
    } else {
      mutation.mutate(data);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* fields */}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </form>
    </Form>
  );
}
```

## Key Patterns

| Pattern | Description |
|---------|-------------|
| `zodResolver` | Zod validation integration |
| `form.formState` | Form state (isSubmitting, errors, etc.) |
| `form.reset()` | Reset form to defaults |
| `form.setValue()` | Programmatic value setting |
| `form.watch()` | Watch field changes |
| `form.trigger()` | Trigger validation |

## When NOT to Use This Skill

- **React 19 Server Actions forms** - Use `react-19` skill for useActionState patterns
- **Basic form handling** - Use `react-forms` skill for general form patterns
- **Non-shadcn/ui components** - Adapt patterns or use `react-forms` skill
- **Non-Zod validation** - Use `react-forms` skill for other validation libraries

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Not using zodResolver | Manual validation, boilerplate | Always use zodResolver with Zod |
| Missing FormField wrapper | No error handling, poor UX | Wrap inputs in FormField |
| Not checking formState.isSubmitting | Button not disabled during submit | Use isSubmitting to disable button |
| Using register without FormField | No shadcn/ui integration | Use FormField with Controller |
| Not calling reset() after success | Form not cleared | Call form.reset() on successful submit |
| Complex validation in component | Hard to test, maintain | Define schema with Zod |
| Not handling mutation errors | Silent failures | Use onError in mutation |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Validation not working | Missing zodResolver | Add resolver: zodResolver(schema) to useForm |
| Errors not displaying | Missing FormMessage | Add <FormMessage /> in FormField |
| Form not resetting | Not calling reset() | Call form.reset() after successful submit |
| Submit button not disabling | Not using isSubmitting | Use form.formState.isSubmitting |
| Custom component not working | Not using Controller | Wrap with Controller in FormField |
| Default values not showing | Not in defaultValues | Add to defaultValues in useForm |
| Type errors | Schema not matching FormData type | Ensure z.infer<typeof schema> matches interface |

## Reference Documentation
- [Form Patterns](quick-ref/forms.md)
- [Validation Schemas](quick-ref/validation.md)
