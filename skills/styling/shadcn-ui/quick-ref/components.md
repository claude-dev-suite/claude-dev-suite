# shadcn/ui Component Reference

> **Knowledge Base:** Read `knowledge/shadcn/basics.md` for complete documentation.

## Installation

```bash
# Initialize shadcn/ui
npx shadcn@latest init

# Add components
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
```

## Button

```tsx
import { Button } from "@/components/ui/button";

// Variants
<Button>Default</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

// With icon
<Button><Mail className="mr-2 h-4 w-4" /> Login with Email</Button>

// Loading state
<Button disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Please wait</Button>
```

## Card

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content goes here.</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

## Dialog

```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you sure?</DialogTitle>
      <DialogDescription>This action cannot be undone.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Form with Input

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

<div className="grid w-full max-w-sm gap-1.5">
  <Label htmlFor="email">Email</Label>
  <Input type="email" id="email" placeholder="Email" />
</div>
```

## Select

```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

<Select>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Select a fruit" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="apple">Apple</SelectItem>
    <SelectItem value="banana">Banana</SelectItem>
    <SelectItem value="orange">Orange</SelectItem>
  </SelectContent>
</Select>
```

## Table

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Email</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>John Doe</TableCell>
      <TableCell>john@example.com</TableCell>
      <TableCell>Active</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

## Toast

```tsx
import { useToast } from "@/components/ui/use-toast";

function MyComponent() {
  const { toast } = useToast();

  return (
    <Button onClick={() => toast({
      title: "Success!",
      description: "Your action was completed.",
    })}>
      Show Toast
    </Button>
  );
}
```

**Official docs:** https://ui.shadcn.com/docs/components
