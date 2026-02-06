# Angular Signals Cheatsheet

> **Knowledge Base:** Read `knowledge/angular/signals.md` for complete documentation.

## Creating Signals

```typescript
import { signal, computed, effect } from '@angular/core';

// Writable signal
const count = signal(0);
const user = signal<User | null>(null);

// Read value
console.log(count()); // 0

// Set value
count.set(5);

// Update based on previous value
count.update(c => c + 1);
```

## Computed Signals

```typescript
const firstName = signal('John');
const lastName = signal('Doe');

// Computed - automatically tracks dependencies
const fullName = computed(() => `${firstName()} ${lastName()}`);

console.log(fullName()); // "John Doe"
```

## Effects

```typescript
// Effect runs when dependencies change
effect(() => {
  console.log(`Count changed to: ${count()}`);
});

// Effect with cleanup
effect((onCleanup) => {
  const timer = setInterval(() => console.log(count()), 1000);
  onCleanup(() => clearInterval(timer));
});
```

## In Components

```typescript
@Component({
  selector: 'app-counter',
  template: `
    <p>Count: {{ count() }}</p>
    <p>Double: {{ double() }}</p>
    <button (click)="increment()">+</button>
  `
})
export class CounterComponent {
  count = signal(0);
  double = computed(() => this.count() * 2);

  increment() {
    this.count.update(c => c + 1);
  }
}
```

## Signal Inputs (Angular 17+)

```typescript
@Component({
  selector: 'app-user',
  template: `<p>Hello {{ name() }}</p>`
})
export class UserComponent {
  // Required input
  name = input.required<string>();

  // Optional input with default
  age = input(0);

  // Aliased input
  email = input('', { alias: 'userEmail' });
}
```

## Signal Outputs (Angular 17+)

```typescript
@Component({
  selector: 'app-button',
  template: `<button (click)="handleClick()">Click</button>`
})
export class ButtonComponent {
  clicked = output<MouseEvent>();

  handleClick(event: MouseEvent) {
    this.clicked.emit(event);
  }
}
```

## Model Signals (Two-way Binding)

```typescript
@Component({
  selector: 'app-input',
  template: `<input [value]="value()" (input)="value.set($event.target.value)">`
})
export class InputComponent {
  value = model('');
}

// Usage: <app-input [(value)]="name" />
```

## toSignal & toObservable

```typescript
import { toSignal, toObservable } from '@angular/core/rxjs-interop';

// Convert Observable to Signal
const users = toSignal(this.userService.getUsers(), { initialValue: [] });

// Convert Signal to Observable
const count$ = toObservable(count);
```

**Official docs:** https://angular.dev/guide/signals
