# React Forms Advanced Patterns

## React 19 Forms with Server Actions

```tsx
// app/actions.ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const ContactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10),
});

export async function submitContact(prevState: any, formData: FormData) {
  const validated = ContactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message'),
  });

  if (!validated.success) {
    return {
      success: false,
      errors: validated.error.flatten().fieldErrors,
    };
  }

  await db.contact.create({ data: validated.data });

  revalidatePath('/contact');

  return { success: true, errors: {} };
}

// app/contact/page.tsx
'use client';

import { useActionState } from 'react';
import { submitContact } from '../actions';

export default function ContactPage() {
  const [state, formAction, isPending] = useActionState(submitContact, {
    success: false,
    errors: {},
  });

  return (
    <form action={formAction}>
      <div>
        <input name="name" placeholder="Name" />
        {state.errors.name && <span>{state.errors.name[0]}</span>}
      </div>

      <div>
        <input name="email" type="email" placeholder="Email" />
        {state.errors.email && <span>{state.errors.email[0]}</span>}
      </div>

      <div>
        <textarea name="message" placeholder="Message" />
        {state.errors.message && <span>{state.errors.message[0]}</span>}
      </div>

      <button disabled={isPending}>
        {isPending ? 'Sending...' : 'Send Message'}
      </button>

      {state.success && <p>Message sent successfully!</p>}
    </form>
  );
}
```

### useFormStatus for Submit Buttons

```tsx
'use client';

import { useFormStatus } from 'react-dom';

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Submitting...' : children}
    </button>
  );
}

// Usage in form
<form action={submitAction}>
  <input name="email" />
  <SubmitButton>Subscribe</SubmitButton>
</form>
```

---

## Complex Form Patterns

### Multi-Step Form

```tsx
interface FormData {
  // Step 1
  firstName: string;
  lastName: string;
  email: string;
  // Step 2
  address: string;
  city: string;
  // Step 3
  cardNumber: string;
  expiry: string;
}

function MultiStepForm() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<FormData>>({});

  const updateFormData = (data: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    await submitOrder(formData);
  };

  return (
    <div>
      <StepIndicator current={step} total={3} />

      {step === 1 && (
        <PersonalInfoStep
          data={formData}
          onUpdate={updateFormData}
          onNext={nextStep}
        />
      )}

      {step === 2 && (
        <AddressStep
          data={formData}
          onUpdate={updateFormData}
          onNext={nextStep}
          onBack={prevStep}
        />
      )}

      {step === 3 && (
        <PaymentStep
          data={formData}
          onUpdate={updateFormData}
          onSubmit={handleSubmit}
          onBack={prevStep}
        />
      )}
    </div>
  );
}

// Each step component
function PersonalInfoStep({ data, onUpdate, onNext }: StepProps) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      email: data.email || '',
    },
  });

  const onSubmit = (stepData: Partial<FormData>) => {
    onUpdate(stepData);
    onNext();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('firstName', { required: true })} />
      <input {...register('lastName', { required: true })} />
      <input {...register('email', { required: true })} type="email" />
      <button type="submit">Next</button>
    </form>
  );
}
```

### Dependent Fields

```tsx
function LocationForm() {
  const { register, watch, setValue } = useForm();

  const selectedCountry = watch('country');

  // Fetch cities when country changes
  const { data: cities } = useQuery({
    queryKey: ['cities', selectedCountry],
    queryFn: () => fetchCities(selectedCountry),
    enabled: !!selectedCountry,
  });

  // Reset city when country changes
  useEffect(() => {
    setValue('city', '');
  }, [selectedCountry, setValue]);

  return (
    <form>
      <select {...register('country')}>
        <option value="">Select country</option>
        {countries.map(c => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
      </select>

      <select {...register('city')} disabled={!selectedCountry}>
        <option value="">Select city</option>
        {cities?.map(city => (
          <option key={city.id} value={city.id}>{city.name}</option>
        ))}
      </select>
    </form>
  );
}
```

### Auto-Save Form

```tsx
function AutoSaveForm({ initialData }: { initialData: FormData }) {
  const { register, watch, formState: { isDirty } } = useForm({
    defaultValues: initialData,
  });

  const formValues = watch();

  // Debounced auto-save
  const debouncedSave = useMemo(
    () => debounce((data: FormData) => {
      saveToServer(data);
    }, 1000),
    []
  );

  useEffect(() => {
    if (isDirty) {
      debouncedSave(formValues);
    }

    return () => debouncedSave.cancel();
  }, [formValues, isDirty, debouncedSave]);

  return (
    <form>
      <input {...register('title')} />
      <textarea {...register('content')} />
      {isDirty && <span className="text-gray-500">Saving...</span>}
    </form>
  );
}
```

---

## Validation Patterns

### Real-time Validation

```tsx
function EmailInput() {
  const { register, formState: { errors } } = useForm({
    mode: 'onChange', // Validate on every change
    // or 'onBlur' for validation on blur
  });

  return (
    <div>
      <input
        {...register('email', {
          required: 'Email is required',
          pattern: {
            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
            message: 'Invalid email address',
          },
        })}
      />
      {errors.email && <span>{errors.email.message}</span>}
    </div>
  );
}
```

### Async Validation

```tsx
function UsernameInput() {
  const { register, formState: { errors } } = useForm();

  return (
    <input
      {...register('username', {
        required: 'Username is required',
        validate: async (value) => {
          const isAvailable = await checkUsernameAvailability(value);
          return isAvailable || 'Username is already taken';
        },
      })}
    />
  );
}
```

### Cross-Field Validation with Zod

```tsx
const schema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string(),
  startDate: z.date(),
  endDate: z.date(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword'],
}).refine(data => data.endDate > data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
});
```

---

## Accessibility

```tsx
function AccessibleForm() {
  const { register, handleSubmit, formState: { errors } } = useForm();

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email', { required: 'Email is required' })}
        />
        {errors.email && (
          <span id="email-error" role="alert">
            {errors.email.message}
          </span>
        )}
      </div>

      <button type="submit">Submit</button>
    </form>
  );
}
```
