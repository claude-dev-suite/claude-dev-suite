# Clean Code Principles Quick Reference

> **Knowledge Base:** Read `knowledge/clean-code/principles.md` for complete documentation.

## Naming

```typescript
// BAD: Unclear names
const d = 86400; // elapsed time in seconds
const list1 = users.filter(u => u.a);
function proc(d) { /* ... */ }

// GOOD: Meaningful names
const SECONDS_PER_DAY = 86400;
const activeUsers = users.filter(user => user.isActive);
function processPayment(paymentDetails) { /* ... */ }

// BAD: Encodings and abbreviations
const strName: string;
const arrUsers: User[];
const btnSubmit;
function calcTtlAmt() {}

// GOOD: Clear, pronounceable names
const name: string;
const users: User[];
const submitButton;
function calculateTotalAmount() {}

// Class names: nouns
class UserRepository {}
class PaymentProcessor {}

// Function names: verbs
function getUser() {}
function calculateTotal() {}
function validateEmail() {}
```

## Functions

```typescript
// BAD: Function does too much
function processUser(user, sendEmail, updateDb, logActivity) {
  if (validateUser(user)) {
    if (updateDb) saveUser(user);
    if (sendEmail) sendWelcomeEmail(user);
    if (logActivity) logUserActivity(user);
  }
}

// GOOD: Single responsibility
function validateUser(user: User): boolean { /* ... */ }
function saveUser(user: User): void { /* ... */ }
function sendWelcomeEmail(user: User): void { /* ... */ }
function logUserActivity(user: User): void { /* ... */ }

function registerUser(user: User): void {
  if (!validateUser(user)) throw new ValidationError();
  saveUser(user);
  sendWelcomeEmail(user);
  logUserActivity(user);
}

// BAD: Too many arguments
function createUser(name, email, age, address, phone, role) {}

// GOOD: Use object parameter
interface CreateUserParams {
  name: string;
  email: string;
  age?: number;
  address?: Address;
  phone?: string;
  role?: Role;
}

function createUser(params: CreateUserParams): User {}

// BAD: Side effects
let total = 0;
function addToTotal(value) {
  total += value;  // Modifies external state
  return total;
}

// GOOD: Pure function
function calculateTotal(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
```

## Comments

```typescript
// BAD: Obvious comments
// This sets the name
this.name = name;

// Increment counter by one
counter++;

// GOOD: Explain why, not what
// Using exponential backoff to avoid overwhelming the server
await delay(Math.pow(2, attempt) * 1000);

// Regex for validating email according to RFC 5322
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// TODO: Refactor when we upgrade to v2 API
// FIXME: Race condition when multiple users edit simultaneously

// BAD: Commented-out code (just delete it)
// function oldImplementation() { ... }

// GOOD: Let code document itself
// Instead of:
// Check if user is admin
if (user.role === 'admin') {}

// Write:
const isAdmin = user.role === 'admin';
if (isAdmin) {}
```

## Error Handling

```typescript
// BAD: Swallowing errors
try {
  doSomething();
} catch (e) {
  // ignore
}

// BAD: Generic error handling
try {
  processPayment();
} catch (e) {
  console.log('Error');
}

// GOOD: Specific error handling
try {
  await processPayment(order);
} catch (error) {
  if (error instanceof PaymentDeclinedError) {
    await notifyUserPaymentFailed(order.userId);
    throw error;
  }
  if (error instanceof NetworkError) {
    await queueForRetry(order);
    return { status: 'pending' };
  }
  logger.error('Unexpected payment error', { error, orderId: order.id });
  throw error;
}

// BAD: Return null for errors
function findUser(id: string): User | null {
  const user = db.users.find(id);
  return user || null;
}

// GOOD: Use Result type or throw
function findUser(id: string): User {
  const user = db.users.find(id);
  if (!user) throw new NotFoundError(`User ${id} not found`);
  return user;
}
```

## Code Structure

```typescript
// BAD: Deep nesting
function processOrder(order) {
  if (order) {
    if (order.items.length > 0) {
      if (order.status === 'pending') {
        if (validateItems(order.items)) {
          // process order
        }
      }
    }
  }
}

// GOOD: Early returns
function processOrder(order: Order | null): void {
  if (!order) return;
  if (order.items.length === 0) return;
  if (order.status !== 'pending') return;
  if (!validateItems(order.items)) {
    throw new ValidationError('Invalid items');
  }

  // Process order - main logic is not nested
}

// GOOD: Guard clauses
function calculateDiscount(user: User, order: Order): number {
  if (!user.isPremium) return 0;
  if (order.total < 100) return 0;

  return order.total * 0.1;
}
```

## DRY (Don't Repeat Yourself)

```typescript
// BAD: Repetition
function validateEmail(email: string) {
  if (!email) throw new Error('Email required');
  if (!email.includes('@')) throw new Error('Invalid email');
}

function validateUsername(username: string) {
  if (!username) throw new Error('Username required');
  if (username.length < 3) throw new Error('Username too short');
}

// GOOD: Abstraction
function validateRequired(value: any, fieldName: string): void {
  if (!value) throw new ValidationError(`${fieldName} is required`);
}

function validateEmail(email: string): void {
  validateRequired(email, 'Email');
  if (!email.includes('@')) throw new ValidationError('Invalid email format');
}

function validateUsername(username: string): void {
  validateRequired(username, 'Username');
  if (username.length < 3) throw new ValidationError('Username too short');
}
```

## KISS (Keep It Simple, Stupid)

```typescript
// BAD: Over-engineered
class UserServiceFactoryProviderImpl implements IUserServiceFactoryProvider {
  createUserServiceFactory(): IUserServiceFactory {
    return new UserServiceFactoryImpl(
      new UserRepositoryFactoryImpl()
    );
  }
}

// GOOD: Simple and direct
class UserService {
  constructor(private userRepository: UserRepository) {}

  async getUser(id: string): Promise<User> {
    return this.userRepository.findById(id);
  }
}
```

**References:** Clean Code by Robert C. Martin
