# Yup - Advanced Patterns

## Conditional Validation (when)

```typescript
const paymentSchema = yup.object({
  method: yup.string().required().oneOf(['credit_card', 'bank_transfer', 'paypal']),

  // Conditional based on method
  cardNumber: yup.string().when('method', {
    is: 'credit_card',
    then: (schema) => schema.required().matches(/^\d{16}$/),
    otherwise: (schema) => schema.strip(),
  }),

  iban: yup.string().when('method', {
    is: 'bank_transfer',
    then: (schema) => schema.required(),
    otherwise: (schema) => schema.strip(),
  }),

  paypalEmail: yup.string().when('method', {
    is: 'paypal',
    then: (schema) => schema.required().email(),
    otherwise: (schema) => schema.strip(),
  }),
});

// Multiple conditions
const schema = yup.object({
  isBusiness: yup.boolean(),
  companyName: yup.string().when('isBusiness', {
    is: true,
    then: (schema) => schema.required(),
  }),
});

// Array of conditions
const complexSchema = yup.object({
  field1: yup.string(),
  field2: yup.string(),
  dependent: yup.string().when(['field1', 'field2'], {
    is: (field1, field2) => field1 === 'a' && field2 === 'b',
    then: (schema) => schema.required(),
  }),
});
```

## Custom Validation (test)

```typescript
// test() method
const passwordSchema = yup.string()
  .required()
  .min(8)
  .test(
    'has-uppercase',
    'Must contain uppercase letter',
    (value) => /[A-Z]/.test(value || '')
  )
  .test(
    'has-number',
    'Must contain number',
    (value) => /\d/.test(value || '')
  );

// Async validation
const uniqueEmailSchema = yup.string()
  .email()
  .test(
    'unique-email',
    'Email already exists',
    async (value) => {
      if (!value) return true;
      const exists = await checkEmailExists(value);
      return !exists;
    }
  );

// Access other fields in test
const confirmPasswordSchema = yup.object({
  password: yup.string().required().min(8),
  confirmPassword: yup.string()
    .required()
    .test(
      'passwords-match',
      'Passwords must match',
      function (value) {
        return value === this.parent.password;
      }
    ),
});

// Or use ref
const withRefSchema = yup.object({
  password: yup.string().required().min(8),
  confirmPassword: yup.string()
    .required()
    .oneOf([yup.ref('password')], 'Passwords must match'),
});
```

## Add Custom Methods

```typescript
// Extend string with custom method
yup.addMethod(yup.string, 'slug', function () {
  return this.matches(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Must be a valid slug'
  );
});

// Usage (requires type augmentation)
declare module 'yup' {
  interface StringSchema {
    slug(): StringSchema;
  }
}

const slugSchema = yup.string().slug();
```

## Formik Integration

```tsx
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as yup from 'yup';

const validationSchema = yup.object({
  email: yup.string().required('Required').email('Invalid email'),
  password: yup.string().required('Required').min(8, 'Too short'),
});

function LoginForm() {
  return (
    <Formik
      initialValues={{ email: '', password: '' }}
      validationSchema={validationSchema}
      onSubmit={(values) => {
        console.log(values);
      }}
    >
      {({ isSubmitting, errors, touched }) => (
        <Form>
          <div>
            <Field name="email" type="email" placeholder="Email" />
            <ErrorMessage name="email" component="div" className="error" />
          </div>

          <div>
            <Field name="password" type="password" placeholder="Password" />
            <ErrorMessage name="password" component="div" className="error" />
          </div>

          <button type="submit" disabled={isSubmitting}>
            Submit
          </button>
        </Form>
      )}
    </Formik>
  );
}
```

## React Hook Form Integration

```tsx
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

const schema = yup.object({
  email: yup.string().required().email(),
  password: yup.string().required().min(8),
});

type FormData = yup.InferType<typeof schema>;

function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: yupResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} placeholder="Email" />
      {errors.email && <span>{errors.email.message}</span>}

      <input {...register('password')} type="password" placeholder="Password" />
      {errors.password && <span>{errors.password.message}</span>}

      <button type="submit">Submit</button>
    </form>
  );
}
```

## Transform and Cast

```typescript
const schema = yup.object({
  // Transform during validation
  name: yup.string()
    .transform((value) => value?.trim())
    .required(),

  // Cast without validation
  age: yup.number()
    .transform((value, originalValue) => {
      return originalValue === '' ? undefined : value;
    })
    .nullable(),

  // Default value
  role: yup.string().default('user'),

  // Ensure array
  tags: yup.array().of(yup.string()).ensure(),
});

// Cast only (no validation)
const casted = schema.cast(data);

// Validate and transform
const validated = await schema.validate(data);
```

## Error Handling

```typescript
import * as yup from 'yup';

try {
  await schema.validate(data, { abortEarly: false });
} catch (error) {
  if (error instanceof yup.ValidationError) {
    // All error messages
    console.log(error.errors);

    // Inner errors with path
    error.inner.forEach((err) => {
      console.log(`${err.path}: ${err.message}`);
    });

    // Convert to object { field: message }
    const errorMap = error.inner.reduce((acc, err) => {
      if (err.path) {
        acc[err.path] = err.message;
      }
      return acc;
    }, {} as Record<string, string>);
  }
}
```

## Localization

```typescript
import * as yup from 'yup';

// Set default messages
yup.setLocale({
  mixed: {
    required: 'Required field',
    notType: 'Invalid type',
  },
  string: {
    email: 'Invalid email',
    min: 'Must have at least ${min} characters',
    max: 'Must have at most ${max} characters',
  },
  number: {
    min: 'Must be at least ${min}',
    max: 'Must be at most ${max}',
  },
});
```

## Validation Options

```typescript
const schema = yup.object({ /* ... */ });

// Validate with options
const result = await schema.validate(data, {
  abortEarly: false,    // Return all errors, not just first
  stripUnknown: true,   // Remove unknown keys
  strict: false,        // Allow type coercion
  recursive: true,      // Validate nested objects
  context: { user },    // Pass context for tests
});

// Validate at path
await schema.validateAt('address.city', data);

// Sync validation
schema.validateSync(data);
schema.isValidSync(data);  // Returns boolean
```
