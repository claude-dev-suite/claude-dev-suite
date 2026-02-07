---
name: angular-forms
description: |
  Angular Reactive Forms with validators, FormArray, and dynamic forms.
  Covers typed forms, custom validators, and form patterns.

  USE WHEN: user mentions "Angular forms", "reactive forms", "FormGroup", "FormArray",
  "validators", "form validation", "Angular form patterns"

  DO NOT USE FOR: React forms - use `react-hook-form` or `react-forms`,
  template-driven forms for simple cases
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Angular Forms - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `angular`, topic: `forms` for comprehensive documentation.

## Typed Reactive Forms (Angular 14+)

```typescript
import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <input formControlName="name" />
      <input formControlName="email" type="email" />
      <button type="submit" [disabled]="form.invalid">Save</button>
    </form>
  `
})
export class UserFormComponent {
  private fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    age: [0, [Validators.min(0), Validators.max(150)]],
  });

  onSubmit() {
    if (this.form.valid) {
      const value = this.form.getRawValue(); // Typed!
      console.log(value.name); // string, not string | null
    }
  }
}
```

## FormArray

```typescript
form = this.fb.group({
  name: ['', Validators.required],
  addresses: this.fb.array([this.createAddress()]),
});

createAddress() {
  return this.fb.group({
    street: ['', Validators.required],
    city: ['', Validators.required],
    zip: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
  });
}

get addresses() {
  return this.form.get('addresses') as FormArray;
}

addAddress() {
  this.addresses.push(this.createAddress());
}

removeAddress(index: number) {
  this.addresses.removeAt(index);
}
```

## Custom Validators

```typescript
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Sync validator
export function forbiddenName(name: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const forbidden = control.value === name;
    return forbidden ? { forbiddenName: { value: control.value } } : null;
  };
}

// Async validator
export function uniqueEmail(userService: UserService): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    return userService.checkEmail(control.value).pipe(
      map(exists => exists ? { emailTaken: true } : null),
      catchError(() => of(null))
    );
  };
}

// Cross-field validator
export const passwordMatchValidator: ValidatorFn = (form: AbstractControl) => {
  const password = form.get('password')?.value;
  const confirm = form.get('confirmPassword')?.value;
  return password === confirm ? null : { passwordMismatch: true };
};
```

## Error Display Pattern

```typescript
@Component({
  template: `
    <input formControlName="email" />
    @if (form.controls.email.hasError('required') && form.controls.email.touched) {
      <span class="error">Email is required</span>
    }
    @if (form.controls.email.hasError('email') && form.controls.email.touched) {
      <span class="error">Invalid email format</span>
    }
  `
})
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Template-driven for complex forms | Hard to test, no type safety | Use reactive forms |
| Not using `nonNullable` | Nullable types everywhere | Use `fb.nonNullable.group()` |
| Validation in component | Not reusable | Extract to validator functions |
| Subscribing to valueChanges without cleanup | Memory leaks | Use `takeUntilDestroyed()` |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Form always invalid | Missing required field value | Check initial values |
| Type errors with controls | Using untyped FormGroup | Use `fb.nonNullable.group()` |
| Async validator fires too often | No debounce | Add `updateOn: 'blur'` |
| FormArray changes not reflected | Missing trackBy | Use track in `@for` |
