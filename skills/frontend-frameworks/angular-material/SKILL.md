---
name: angular-material
description: |
  Angular Material and CDK for UI components, theming, and custom components.
  Covers standalone Material components and custom themes.

  USE WHEN: user mentions "Angular Material", "Material CDK", "mat-table", "mat-dialog",
  "Angular UI components", "Material theming", "Angular CDK"

  DO NOT USE FOR: Bootstrap - use CSS framework skills,
  PrimeNG or other Angular UI libs
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Angular Material - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `angular` for Material documentation.

## Setup

```typescript
// app.config.ts
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [provideAnimationsAsync()],
};
```

## Common Components

### Table with Sorting and Pagination

```typescript
import { Component, signal, ViewChild } from '@angular/core';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';

@Component({
  standalone: true,
  imports: [MatTableModule, MatSortModule, MatPaginatorModule],
  template: `
    <table mat-table [dataSource]="dataSource" matSort>
      <ng-container matColumnDef="name">
        <th mat-header-cell *matHeaderCellDef mat-sort-header>Name</th>
        <td mat-cell *matCellDef="let row">{{ row.name }}</td>
      </ng-container>
      <ng-container matColumnDef="email">
        <th mat-header-cell *matHeaderCellDef>Email</th>
        <td mat-cell *matCellDef="let row">{{ row.email }}</td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
    </table>
    <mat-paginator [pageSizeOptions]="[5, 10, 25]" showFirstLastButtons />
  `
})
export class UserTableComponent {
  displayedColumns = ['name', 'email'];
  dataSource = new MatTableDataSource<User>([]);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }
}
```

### Dialog

```typescript
import { MatDialogModule, MatDialog } from '@angular/material/dialog';

// Open dialog
@Component({ ... })
export class ParentComponent {
  private dialog = inject(MatDialog);

  openDialog() {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: { message: 'Are you sure?' },
    });
    ref.afterClosed().subscribe(result => {
      if (result) { /* confirmed */ }
    });
  }
}

// Dialog component
@Component({
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Confirm</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [mat-dialog-close]="true" color="primary">OK</button>
    </mat-dialog-actions>
  `
})
export class ConfirmDialogComponent {
  data = inject(MAT_DIALOG_DATA);
}
```

### Form Fields

```typescript
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  standalone: true,
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <mat-form-field appearance="outline">
      <mat-label>Name</mat-label>
      <input matInput formControlName="name" />
      <mat-error>Name is required</mat-error>
    </mat-form-field>

    <mat-form-field appearance="outline">
      <mat-label>Role</mat-label>
      <mat-select formControlName="role">
        <mat-option value="admin">Admin</mat-option>
        <mat-option value="user">User</mat-option>
      </mat-select>
    </mat-form-field>
  `
})
```

## Custom Theming

```scss
// styles.scss
@use '@angular/material' as mat;

$primary: mat.m2-define-palette(mat.$m2-indigo-palette);
$accent: mat.m2-define-palette(mat.$m2-pink-palette);
$theme: mat.m2-define-light-theme((
  color: (primary: $primary, accent: $accent),
  typography: mat.m2-define-typography-config(),
  density: 0,
));

@include mat.all-component-themes($theme);
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Importing entire Material module | Large bundle | Import individual modules |
| Not using `appearance="outline"` | Inconsistent UI | Standardize form field appearance |
| Synchronous animations | Blocks rendering | Use `provideAnimationsAsync()` |
| Custom CSS for Material components | Breaks updates | Use theming API |
