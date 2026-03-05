---
name: pagination
description: |
  API pagination patterns. Offset-based, cursor-based, keyset pagination.
  Filtering, sorting, and page metadata. REST and GraphQL pagination
  implementations.

  USE WHEN: user mentions "pagination", "paginate", "cursor", "offset",
  "page size", "next page", "infinite scroll API", "list endpoint"

  DO NOT USE FOR: frontend infinite scroll UI - use frontend framework skills;
  database query optimization - use database skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Pagination

## Cursor-Based (recommended for large datasets)

```typescript
app.get('/api/products', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const cursor = req.query.cursor as string | undefined;

  const where: any = {};
  if (cursor) {
    where.id = { gt: cursor };
  }

  const items = await db.product.findMany({
    where,
    take: limit + 1, // Fetch one extra to check hasMore
    orderBy: { id: 'asc' },
  });

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  res.json({
    data: items,
    pagination: {
      hasMore,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    },
  });
});
```

## Offset-Based (simple, good for small datasets)

```typescript
app.get('/api/products', async (req, res) => {
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.product.findMany({ skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
    db.product.count(),
  ]);

  res.json({
    data: items,
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + items.length < total,
    },
  });
});
```

## Filtering and Sorting

```typescript
app.get('/api/products', async (req, res) => {
  const { sort = 'createdAt', order = 'desc', category, minPrice, maxPrice, search } = req.query;

  const where: any = {};
  if (category) where.category = category;
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = parseFloat(minPrice as string);
    if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
  }
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const items = await db.product.findMany({
    where,
    orderBy: { [sort as string]: order },
    take: limit,
    skip: offset,
  });

  res.json({ data: items, pagination: { /* ... */ } });
});
```

## Spring Boot (Pageable)

```java
@GetMapping("/products")
public Page<ProductDto> list(
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "20") int size,
    @RequestParam(defaultValue = "createdAt,desc") String[] sort) {

    Pageable pageable = PageRequest.of(page, Math.min(size, 100),
        Sort.by(Sort.Direction.fromString(sort[1]), sort[0]));
    return productRepo.findAll(pageable).map(mapper::toDto);
}
```

## Comparison

| Strategy | Pros | Cons | Best For |
|----------|------|------|----------|
| Offset | Simple, jump to page | Slow on large tables, skip drift | Admin panels, small datasets |
| Cursor | Fast, stable with inserts | Can't jump to page N | Feeds, infinite scroll, large datasets |
| Keyset | Fast, no skip drift | Complex multi-column sort | Time-series, ordered data |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No max page size | Cap `limit` (e.g., max 100) |
| COUNT(*) on huge tables | Use cursor pagination, skip total count |
| Offset on millions of rows | Use cursor or keyset pagination |
| Returning all fields | Select only needed fields, support `fields` param |
| No default sorting | Always define default sort for stable results |

## Production Checklist

- [ ] Maximum page size enforced (e.g., 100)
- [ ] Default sort order defined
- [ ] Cursor pagination for large/growing datasets
- [ ] Input validation on page/limit/sort params
- [ ] Consistent response envelope (`data`, `pagination`)
