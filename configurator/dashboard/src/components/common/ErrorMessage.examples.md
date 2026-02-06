# ErrorMessage Component Examples

## Network Error with Retry

```tsx
<ErrorMessage
  error="Cannot connect to the server. Please check your connection and try again."
  isNetworkError={true}
  onRetry={() => refetch()}
/>
```

**Visual:**
```
┌────────────────────────────────────────────────────────────┐
│ ⚠️  Cannot connect to the server. Please check your        │
│     connection and try again.                              │
│                                                            │
│     Please check that the server is running and try again.│
│                                                  [Retry]   │
└────────────────────────────────────────────────────────────┘
```
**Colors:** Orange background, orange border

---

## Validation Error with Details

```tsx
<ErrorMessage
  error="Invalid email address"
  errorObj={new ValidationError('Invalid email address', {
    field: 'email',
    value: 'not-an-email'
  })}
  isValidationError={true}
  showDetails={true}
/>
```

**Visual:**
```
┌────────────────────────────────────────────────────────────┐
│ ❌  Invalid email address                                  │
│                                                            │
│     Details:                                               │
│     ┌─────────────────────────────────────┐               │
│     │ {                                   │               │
│     │   "field": "email",                 │               │
│     │   "value": "not-an-email"           │               │
│     │ }                                   │               │
│     └─────────────────────────────────────┘               │
└────────────────────────────────────────────────────────────┘
```
**Colors:** Yellow background, yellow border

---

## Server Error

```tsx
<ErrorMessage
  error="The server encountered an error. Please try again later."
  isServerError={true}
/>
```

**Visual:**
```
┌────────────────────────────────────────────────────────────┐
│ 🔥  The server encountered an error. Please try again      │
│     later.                                                 │
│                                                            │
│     This is likely a temporary issue. Please try again in │
│     a few moments.                                         │
└────────────────────────────────────────────────────────────┘
```
**Colors:** Red background, red border

---

## Generic Error

```tsx
<ErrorMessage
  error="Something went wrong"
/>
```

**Visual:**
```
┌────────────────────────────────────────────────────────────┐
│ ⚠️  Something went wrong                                   │
└────────────────────────────────────────────────────────────┘
```
**Colors:** Red background, red border

---

## With Error Code (Debug Mode)

```tsx
<ErrorMessage
  error="Validation failed"
  errorObj={new ApiError('Validation failed', 400, 'VAL_001')}
  showDetails={true}
/>
```

**Visual:**
```
┌────────────────────────────────────────────────────────────┐
│ ⚠️  Validation failed                                      │
│                                                            │
│     Error Code: VAL_001                                   │
│     HTTP Status: 400                                      │
└────────────────────────────────────────────────────────────┘
```
**Colors:** Red background, red border

---

## Usage in Components

### Loading, Error, and Success States

```tsx
function DataComponent() {
  const { data, loading, error, errorObj, isNetworkError, refetch } =
    useApi<MyData>('/api/data');

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <ErrorMessage
        error={error}
        errorObj={errorObj}
        isNetworkError={isNetworkError}
        onRetry={refetch}
      />
    );
  }

  return (
    <div>
      <h1>{data.title}</h1>
      <p>{data.description}</p>
    </div>
  );
}
```

### Form Validation

```tsx
function MyForm() {
  const { mutate, error, errorObj, isValidationError, reset } =
    useMutation('/api/submit');

  const handleSubmit = async (formData) => {
    reset(); // Clear previous errors
    const result = await mutate(formData);
    if (result) {
      // Success - redirect or show success message
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <ErrorMessage
          error={error}
          errorObj={errorObj}
          isValidationError={isValidationError}
          showDetails={import.meta.env.DEV}
          className="mb-4"
        />
      )}
      {/* form fields */}
    </form>
  );
}
```

### Inline Error Display

```tsx
function CompactErrorExample() {
  const { error, isNetworkError, refetch } = useApi('/api/data');

  return (
    <div className="space-y-4">
      <h2>Dashboard</h2>

      {error && (
        <ErrorMessage
          error={error}
          isNetworkError={isNetworkError}
          onRetry={refetch}
          className="mb-4"
        />
      )}

      {/* rest of content */}
    </div>
  );
}
```

## Styling Variants

### Different Error Types

| Error Type | Icon | Background | Border | Use Case |
|------------|------|------------|--------|----------|
| Network | ⚠️ | Orange/10 | Orange/30 | Connection failures, timeout |
| Validation | ❌ | Yellow/10 | Yellow/30 | Invalid input, missing fields |
| Server | 🔥 | Red/10 | Red/30 | 500 errors, crashes |
| Generic | ⚠️ | Red/10 | Red/30 | Unknown errors |

### Custom Styling

```tsx
<ErrorMessage
  error={error}
  className="my-custom-spacing shadow-lg"
/>
```

## Props Reference

```typescript
interface ErrorMessageProps {
  error: string | null;              // Required: error message to display
  errorObj?: ApiError | null;        // Optional: full error object
  isNetworkError?: boolean;          // Show as network error
  isValidationError?: boolean;       // Show as validation error
  isServerError?: boolean;           // Show as server error
  onRetry?: () => void;              // Retry callback (shows button)
  className?: string;                // Additional CSS classes
  showDetails?: boolean;             // Show error code/status/details
}
```

## Best Practices

1. **Always show retry for network errors**
   ```tsx
   {isNetworkError && <ErrorMessage error={error} onRetry={refetch} />}
   ```

2. **Show details only in development**
   ```tsx
   <ErrorMessage error={error} showDetails={import.meta.env.DEV} />
   ```

3. **Use with form validation**
   ```tsx
   {isValidationError && (
     <ErrorMessage
       error={error}
       errorObj={errorObj}
       showDetails={true}
     />
   )}
   ```

4. **Provide context with className**
   ```tsx
   <ErrorMessage error={error} className="mt-4 mb-6" />
   ```

5. **Clear errors on retry/reset**
   ```tsx
   const handleRetry = () => {
     reset(); // Clear error state
     refetch(); // Try again
   };
   ```
