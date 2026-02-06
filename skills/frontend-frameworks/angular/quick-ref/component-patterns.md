# Angular Component Patterns

> **Knowledge Base:** Read `knowledge/angular/components.md` for complete documentation.

## Standalone Components (Recommended)

```typescript
@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="card">
      <h2>{{ user.name }}</h2>
      <a [routerLink]="['/users', user.id]">View</a>
    </div>
  `
})
export class UserCardComponent {
  @Input({ required: true }) user!: User;
}
```

## Smart vs Dumb Components

```typescript
// Smart (Container) Component - handles logic
@Component({
  selector: 'app-user-list-container',
  standalone: true,
  imports: [UserListComponent],
  template: `<app-user-list [users]="users()" (select)="onSelect($event)" />`
})
export class UserListContainerComponent {
  users = toSignal(inject(UserService).getUsers());

  onSelect(user: User) {
    inject(Router).navigate(['/users', user.id]);
  }
}

// Dumb (Presentational) Component - only displays
@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    @for (user of users; track user.id) {
      <div (click)="select.emit(user)">{{ user.name }}</div>
    }
  `
})
export class UserListComponent {
  @Input() users: User[] = [];
  @Output() select = new EventEmitter<User>();
}
```

## Content Projection

```typescript
@Component({
  selector: 'app-card',
  template: `
    <div class="card">
      <ng-content select="[card-header]"></ng-content>
      <ng-content></ng-content>
      <ng-content select="[card-footer]"></ng-content>
    </div>
  `
})
export class CardComponent {}

// Usage
// <app-card>
//   <h2 card-header>Title</h2>
//   <p>Content</p>
//   <button card-footer>Action</button>
// </app-card>
```

## Template References

```typescript
@Component({
  template: `
    <input #inputRef />
    <button (click)="focusInput()">Focus</button>
  `
})
export class FormComponent {
  @ViewChild('inputRef') inputRef!: ElementRef<HTMLInputElement>;

  focusInput() {
    this.inputRef.nativeElement.focus();
  }
}
```

## Dynamic Components

```typescript
@Component({
  template: `<ng-container #container></ng-container>`
})
export class DynamicHostComponent {
  @ViewChild('container', { read: ViewContainerRef })
  container!: ViewContainerRef;

  loadComponent(component: Type<any>) {
    this.container.clear();
    const ref = this.container.createComponent(component);
    ref.instance.data = { /* props */ };
  }
}
```

## Control Flow (Angular 17+)

```html
@if (user) {
  <p>{{ user.name }}</p>
} @else {
  <p>Loading...</p>
}

@for (item of items; track item.id) {
  <div>{{ item.name }}</div>
} @empty {
  <p>No items</p>
}

@switch (status) {
  @case ('loading') { <spinner /> }
  @case ('error') { <error-message /> }
  @default { <content /> }
}
```

**Official docs:** https://angular.dev/guide/components
