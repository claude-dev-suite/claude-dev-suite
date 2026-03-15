# Refactoring Patterns Quick Reference

> **Knowledge Base:** Read `knowledge/clean-code/refactoring.md` for complete documentation.

## Extract Function

```typescript
// Before
function printUserReport(user: User) {
  console.log('='.repeat(50));
  console.log(`User Report for ${user.name}`);
  console.log('='.repeat(50));
  console.log(`Email: ${user.email}`);
  console.log(`Role: ${user.role}`);
  console.log(`Created: ${user.createdAt.toLocaleDateString()}`);
  console.log('='.repeat(50));
}

// After
function printUserReport(user: User) {
  printHeader(`User Report for ${user.name}`);
  printUserDetails(user);
  printSeparator();
}

function printHeader(title: string) {
  printSeparator();
  console.log(title);
  printSeparator();
}

function printSeparator() {
  console.log('='.repeat(50));
}

function printUserDetails(user: User) {
  console.log(`Email: ${user.email}`);
  console.log(`Role: ${user.role}`);
  console.log(`Created: ${user.createdAt.toLocaleDateString()}`);
}
```

## Replace Conditional with Polymorphism

```typescript
// Before
function calculatePay(employee: Employee): number {
  switch (employee.type) {
    case 'hourly':
      return employee.hours * employee.hourlyRate;
    case 'salaried':
      return employee.salary / 12;
    case 'commissioned':
      return employee.baseSalary + employee.sales * employee.commissionRate;
    default:
      throw new Error('Unknown employee type');
  }
}

// After
interface PayCalculator {
  calculatePay(): number;
}

class HourlyEmployee implements PayCalculator {
  constructor(private hours: number, private hourlyRate: number) {}
  calculatePay(): number {
    return this.hours * this.hourlyRate;
  }
}

class SalariedEmployee implements PayCalculator {
  constructor(private salary: number) {}
  calculatePay(): number {
    return this.salary / 12;
  }
}

class CommissionedEmployee implements PayCalculator {
  constructor(
    private baseSalary: number,
    private sales: number,
    private commissionRate: number
  ) {}
  calculatePay(): number {
    return this.baseSalary + this.sales * this.commissionRate;
  }
}
```

## Replace Magic Numbers with Constants

```typescript
// Before
if (user.age >= 18 && user.age <= 65) {
  const price = basePrice * 0.85;
  if (items.length > 10) {
    discount = 0.15;
  }
}

// After
const MINIMUM_WORKING_AGE = 18;
const MAXIMUM_WORKING_AGE = 65;
const STANDARD_DISCOUNT_RATE = 0.85;
const BULK_DISCOUNT_THRESHOLD = 10;
const BULK_DISCOUNT_RATE = 0.15;

if (user.age >= MINIMUM_WORKING_AGE && user.age <= MAXIMUM_WORKING_AGE) {
  const price = basePrice * STANDARD_DISCOUNT_RATE;
  if (items.length > BULK_DISCOUNT_THRESHOLD) {
    discount = BULK_DISCOUNT_RATE;
  }
}
```

## Introduce Parameter Object

```typescript
// Before
function searchProducts(
  query: string,
  minPrice: number,
  maxPrice: number,
  category: string,
  inStock: boolean,
  sortBy: string,
  sortOrder: string,
  page: number,
  limit: number
) {}

// After
interface SearchParams {
  query: string;
  priceRange?: { min: number; max: number };
  category?: string;
  inStock?: boolean;
  sort?: { field: string; order: 'asc' | 'desc' };
  pagination?: { page: number; limit: number };
}

function searchProducts(params: SearchParams) {}
```

## Replace Nested Conditionals with Guard Clauses

```typescript
// Before
function getPayAmount(employee: Employee): number {
  let result: number;
  if (employee.isSeparated) {
    result = separatedAmount(employee);
  } else {
    if (employee.isRetired) {
      result = retiredAmount(employee);
    } else {
      result = normalAmount(employee);
    }
  }
  return result;
}

// After
function getPayAmount(employee: Employee): number {
  if (employee.isSeparated) return separatedAmount(employee);
  if (employee.isRetired) return retiredAmount(employee);
  return normalAmount(employee);
}
```

## Decompose Conditional

```typescript
// Before
if (date.getMonth() >= 5 && date.getMonth() <= 8) {
  charge = quantity * summerRate;
} else {
  charge = quantity * winterRate + winterServiceCharge;
}

// After
function isSummer(date: Date): boolean {
  return date.getMonth() >= 5 && date.getMonth() <= 8;
}

function summerCharge(quantity: number): number {
  return quantity * summerRate;
}

function winterCharge(quantity: number): number {
  return quantity * winterRate + winterServiceCharge;
}

const charge = isSummer(date)
  ? summerCharge(quantity)
  : winterCharge(quantity);
```

## Extract Class

```typescript
// Before: Person class doing too much
class Person {
  name: string;
  officeAreaCode: string;
  officeNumber: string;

  getOfficePhone(): string {
    return `(${this.officeAreaCode}) ${this.officeNumber}`;
  }
}

// After: Extract PhoneNumber
class PhoneNumber {
  constructor(
    private areaCode: string,
    private number: string
  ) {}

  toString(): string {
    return `(${this.areaCode}) ${this.number}`;
  }
}

class Person {
  name: string;
  officePhone: PhoneNumber;

  getOfficePhone(): string {
    return this.officePhone.toString();
  }
}
```

## Replace Temp with Query

```typescript
// Before
function calculateTotal(order: Order): number {
  const basePrice = order.quantity * order.itemPrice;
  const discountFactor = order.quantity > 100 ? 0.95 : 0.98;
  return basePrice * discountFactor;
}

// After
function calculateTotal(order: Order): number {
  return getBasePrice(order) * getDiscountFactor(order);
}

function getBasePrice(order: Order): number {
  return order.quantity * order.itemPrice;
}

function getDiscountFactor(order: Order): number {
  return order.quantity > 100 ? 0.95 : 0.98;
}
```

## Consolidate Conditional Expression

```typescript
// Before
function calculateDisability(employee: Employee): number {
  if (employee.seniority < 2) return 0;
  if (employee.monthsDisabled > 12) return 0;
  if (employee.isPartTime) return 0;
  // compute disability amount
  return employee.salary * 0.6;
}

// After
function isNotEligibleForDisability(employee: Employee): boolean {
  return (
    employee.seniority < 2 ||
    employee.monthsDisabled > 12 ||
    employee.isPartTime
  );
}

function calculateDisability(employee: Employee): number {
  if (isNotEligibleForDisability(employee)) return 0;
  return employee.salary * 0.6;
}
```

## Introduce Null Object

```typescript
// Before
function getCustomerName(customer: Customer | null): string {
  if (customer === null) {
    return 'Guest';
  }
  return customer.name;
}

// After
class NullCustomer implements Customer {
  get name(): string {
    return 'Guest';
  }
  get email(): string {
    return 'guest@example.com';
  }
}

function getCustomer(id: string): Customer {
  const customer = customerRepository.find(id);
  return customer ?? new NullCustomer();
}
```

**References:** Refactoring by Martin Fowler
