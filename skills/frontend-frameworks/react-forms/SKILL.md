---
name: react-forms
description: |
  React form handling patterns and best practices. Covers controlled vs
  uncontrolled forms, React Hook Form, form validation, complex form patterns,
  and Server Actions forms.

  USE WHEN: user mentions "React forms", "controlled inputs", "uncontrolled inputs",
  "form validation", "multi-step form", asks about "form handling", "form state",
  "React Hook Form basics"

  DO NOT USE FOR: React Hook Form with Zod - use `react-hook-form` skill instead,
  React 19 Server Actions - use `react-19` skill instead,
  basic input handling - use `react` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Forms

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` topic: `forms` for comprehensive documentation on React form patterns and validation strategies.

> **Full Reference**: See [advanced.md](advanced.md) for Server Actions, Multi-Step Forms, Dependent Fields, Auto-Save, Validation Patterns, and Accessibility.

## Controlled vs Uncontrolled

### Controlled Forms

React state controls the input:

```tsx
function ControlledForm() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.email) newErrors.email = 'Email required';
    if (!formData.password) newErrors.password = 'Password required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    console.log('Submitting:', formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <input
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
        />
        {errors.email && <span className="error">{errors.email}</span>}
      </div>

      <div>
        <input
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
        />
        {errors.password && <span className="error">{errors.password}</span>}
      </div>

      <button type="submit">Submit</button>
    </form>
  );
}
```

### Uncontrolled Forms (useRef)

DOM controls the input:

```tsx
function UncontrolledForm() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      email: emailRef.current?.value,
      password: passwordRef.current?.value,
    };

    console.log('Submitting:', data);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input ref={emailRef} name="email" type="email" />
      <input ref={passwordRef} name="password" type="password" />
      <button type="submit">Submit</button>
    </form>
  );
}
```

### FormData API (Uncontrolled)

```tsx
function FormDataForm() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    };

    console.log('Submitting:', data);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit">Submit</button>
    </form>
  );
}
```

---

## React Hook Form

Most popular form library - uncontrolled with great DX:

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

function SignUpForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await signUp(data);
      reset();
    } catch (error) {
      console.error('Sign up failed:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <input {...register('email')} type="email" placeholder="Email" />
        {errors.email && <span className="error">{errors.email.message}</span>}
      </div>

      <div>
        <input {...register('password')} type="password" placeholder="Password" />
        {errors.password && <span className="error">{errors.password.message}</span>}
      </div>

      <div>
        <input {...register('confirmPassword')} type="password" placeholder="Confirm Password" />
        {errors.confirmPassword && <span className="error">{errors.confirmPassword.message}</span>}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing up...' : 'Sign Up'}
      </button>
    </form>
  );
}
```

### Form Arrays

```tsx
import { useFieldArray, useForm } from 'react-hook-form';

interface OrderForm {
  items: { productId: string; quantity: number }[];
  notes: string;
}

function OrderForm() {
  const { register, control, handleSubmit } = useForm<OrderForm>({
    defaultValues: {
      items: [{ productId: '', quantity: 1 }],
      notes: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {fields.map((field, index) => (
        <div key={field.id} className="flex gap-2">
          <select {...register(`items.${index}.productId`)}>
            <option value="">Select product</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <input
            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
            type="number"
            min="1"
          />

          <button type="button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" onClick={() => append({ productId: '', quantity: 1 })}>
        Add Item
      </button>

      <textarea {...register('notes')} placeholder="Notes" />
      <button type="submit">Submit Order</button>
    </form>
  );
}
```

### Controlled Components with RHF

```tsx
import { Controller, useForm } from 'react-hook-form';
import { DatePicker } from '@/components/date-picker';

function EventForm() {
  const { control, handleSubmit } = useForm();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="date"
        control={control}
        rules={{ required: 'Date is required' }}
        render={({ field, fieldState }) => (
          <div>
            <DatePicker
              value={field.value}
              onChange={field.onChange}
            />
            {fieldState.error && (
              <span className="error">{fieldState.error.message}</span>
            )}
          </div>
        )}
      />

      <button type="submit">Create Event</button>
    </form>
  );
}
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Use React Hook Form for complex forms | Manage all form state manually |
| Use Zod/Yup for validation | Write validation from scratch |
| Show inline errors | Show all errors at once |
| Use `aria-*` attributes | Forget accessibility |
| Debounce expensive validations | Validate async on every keystroke |

- ✅ Use controlled inputs when you need real-time validation
- ✅ Use uncontrolled inputs (RHF) for better performance
- ✅ Validate on blur for better UX
- ✅ Show loading state during submission
- ❌ Don't disable submit button on empty form
- ❌ Don't clear form on error
- ❌ Don't show errors before user interaction

## When NOT to Use This Skill

- **React Hook Form with Zod schemas** - Use `react-hook-form` skill for detailed patterns
- **React 19 Server Actions forms** - Use `react-19` skill for useActionState and useFormStatus
- **Simple input handling** - Use `react` skill for basic controlled/uncontrolled inputs
- **Form libraries other than RHF** - Follow library-specific documentation

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Managing all form state manually | Boilerplate, bugs | Use React Hook Form |
| Not validating user input | Security/UX issues | Use Zod validation schema |
| Showing all errors on mount | Bad UX | Validate on blur or submit |
| Disabling submit on empty form | Prevents validation messages | Allow submit, show errors |
| Clearing form on validation error | User loses data | Keep form data, show errors |
| Not showing loading state | Confusing UX | Show loading during submission |
| Missing accessibility attributes | Not accessible | Add aria labels and roles |
| Validating async on every keystroke | Performance issues | Debounce async validation |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Form not submitting | Missing onSubmit or action | Add onSubmit handler to form |
| Validation not working | Schema not applied | Check resolver in useForm |
| Input not updating | Not controlled properly | Ensure value and onChange are set |
| Errors not showing | Missing FormMessage | Add FormMessage component |
| Submit button always disabled | Wrong isPending check | Use formState.isSubmitting |
| Values not resetting | Not calling reset() | Call form.reset() after success |
| Async validation too frequent | No debounce | Debounce validation function |

## Reference Documentation

- [React Hook Form](https://react-hook-form.com/)
- [Zod](https://zod.dev/)
- MCP: `mcp__documentation__fetch_docs` → technology: `react`, topic: `forms`
