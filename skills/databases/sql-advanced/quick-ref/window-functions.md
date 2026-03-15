# Window Functions Quick Reference

## Syntax

```sql
function_name(args) OVER (
    [PARTITION BY partition_columns]
    [ORDER BY sort_columns]
    [frame_clause]
)
```

## Ranking Functions

| Function | Description |
|----------|-------------|
| `ROW_NUMBER()` | Unique sequential number |
| `RANK()` | Rank with gaps for ties |
| `DENSE_RANK()` | Rank without gaps |
| `NTILE(n)` | Distribute into n buckets |
| `PERCENT_RANK()` | Relative rank (0-1) |
| `CUME_DIST()` | Cumulative distribution |

```sql
SELECT
    name,
    score,
    ROW_NUMBER() OVER (ORDER BY score DESC) as row_num,    -- 1,2,3,4,5
    RANK() OVER (ORDER BY score DESC) as rank,             -- 1,2,2,4,5
    DENSE_RANK() OVER (ORDER BY score DESC) as dense_rank, -- 1,2,2,3,4
    NTILE(4) OVER (ORDER BY score DESC) as quartile,       -- 1,1,2,2,3,3,4,4
    PERCENT_RANK() OVER (ORDER BY score DESC) as pct_rank, -- 0.0, 0.25, 0.5...
    CUME_DIST() OVER (ORDER BY score DESC) as cum_dist     -- cumulative %
FROM students;
```

## Value Functions

| Function | Description |
|----------|-------------|
| `LAG(col, n)` | Value from n rows before |
| `LEAD(col, n)` | Value from n rows after |
| `FIRST_VALUE(col)` | First value in frame |
| `LAST_VALUE(col)` | Last value in frame |
| `NTH_VALUE(col, n)` | Nth value in frame |

```sql
SELECT
    date,
    sales,
    LAG(sales, 1) OVER (ORDER BY date) as prev_day,
    LAG(sales, 7) OVER (ORDER BY date) as prev_week,
    LEAD(sales, 1) OVER (ORDER BY date) as next_day,
    FIRST_VALUE(sales) OVER (ORDER BY date) as first_sale,
    LAST_VALUE(sales) OVER (
        ORDER BY date
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as last_sale
FROM daily_sales;
```

### LAG/LEAD with Default

```sql
SELECT
    date,
    sales,
    LAG(sales, 1, 0) OVER (ORDER BY date) as prev_or_zero,
    LEAD(sales, 1, sales) OVER (ORDER BY date) as next_or_current
FROM daily_sales;
```

## Aggregate Functions as Windows

```sql
SELECT
    date,
    amount,
    -- Running totals
    SUM(amount) OVER (ORDER BY date) as running_total,
    COUNT(*) OVER (ORDER BY date) as running_count,
    AVG(amount) OVER (ORDER BY date) as running_avg,
    -- Partition totals
    SUM(amount) OVER (PARTITION BY category) as category_total,
    -- Global totals
    SUM(amount) OVER () as grand_total,
    -- Percentage
    ROUND(100.0 * amount / SUM(amount) OVER (), 2) as pct_of_total
FROM transactions;
```

## Frame Clauses

### Syntax

```sql
{ROWS | RANGE | GROUPS} BETWEEN frame_start AND frame_end
```

### Frame Bounds

| Bound | Description |
|-------|-------------|
| `UNBOUNDED PRECEDING` | Start of partition |
| `n PRECEDING` | n rows/values before |
| `CURRENT ROW` | Current row |
| `n FOLLOWING` | n rows/values after |
| `UNBOUNDED FOLLOWING` | End of partition |

### ROWS vs RANGE vs GROUPS

```sql
-- ROWS: Physical row count
SUM(x) OVER (ORDER BY y ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
-- Includes current row and 2 physical rows before

-- RANGE: Logical value range (ties grouped)
SUM(x) OVER (ORDER BY y RANGE BETWEEN 2 PRECEDING AND CURRENT ROW)
-- Includes current row and rows where y is within 2 of current y

-- GROUPS: Groups of tied values
SUM(x) OVER (ORDER BY y GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW)
-- Includes current group and 1 group before (PostgreSQL 11+)
```

### Common Frame Patterns

```sql
-- Default frame (with ORDER BY)
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW

-- Full partition
ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING

-- Moving window (7 rows)
ROWS BETWEEN 6 PRECEDING AND CURRENT ROW

-- Centered window
ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING

-- Exclude current row
ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
```

## PARTITION BY

```sql
-- Rank within each department
SELECT
    department,
    name,
    salary,
    RANK() OVER (PARTITION BY department ORDER BY salary DESC) as dept_rank
FROM employees;

-- Running total per category
SELECT
    category,
    date,
    amount,
    SUM(amount) OVER (PARTITION BY category ORDER BY date) as category_running_total
FROM transactions;

-- Multiple partitions
SELECT
    region,
    product,
    sales,
    SUM(sales) OVER (PARTITION BY region) as region_total,
    SUM(sales) OVER (PARTITION BY product) as product_total,
    SUM(sales) OVER (PARTITION BY region, product) as region_product_total
FROM sales_data;
```

## Named Windows

```sql
SELECT
    name,
    department,
    salary,
    RANK() OVER dept_salary as rank,
    SUM(salary) OVER dept_salary as running_sum,
    AVG(salary) OVER dept_salary as running_avg
FROM employees
WINDOW dept_salary AS (PARTITION BY department ORDER BY salary DESC);
```

## Common Patterns

### Top N per Group

```sql
-- Top 3 products per category
SELECT * FROM (
    SELECT
        category_id,
        product_name,
        sales,
        ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY sales DESC) as rn
    FROM products
) ranked
WHERE rn <= 3;
```

### Running Totals

```sql
SELECT
    date,
    amount,
    SUM(amount) OVER (ORDER BY date) as balance
FROM transactions;
```

### Moving Average

```sql
SELECT
    date,
    value,
    AVG(value) OVER (ORDER BY date ROWS 6 PRECEDING) as ma_7day,
    AVG(value) OVER (ORDER BY date ROWS 29 PRECEDING) as ma_30day
FROM daily_metrics;
```

### Year-over-Year Comparison

```sql
SELECT
    year,
    month,
    revenue,
    LAG(revenue, 12) OVER (ORDER BY year, month) as revenue_last_year,
    revenue - LAG(revenue, 12) OVER (ORDER BY year, month) as yoy_change
FROM monthly_revenue;
```

### Cumulative Percentage

```sql
SELECT
    product,
    revenue,
    SUM(revenue) OVER (ORDER BY revenue DESC) as cumulative_revenue,
    ROUND(100.0 * SUM(revenue) OVER (ORDER BY revenue DESC) /
          SUM(revenue) OVER (), 2) as cumulative_pct
FROM products;
```

### Identify Gaps

```sql
SELECT
    id,
    LEAD(id) OVER (ORDER BY id) as next_id,
    LEAD(id) OVER (ORDER BY id) - id as gap
FROM items
WHERE LEAD(id) OVER (ORDER BY id) - id > 1;
```

### Sessionization

```sql
-- Group events into sessions (30 min gap = new session)
WITH events_with_gap AS (
    SELECT
        user_id,
        event_time,
        CASE
            WHEN event_time - LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time)
                 > INTERVAL '30 minutes'
            THEN 1
            ELSE 0
        END as new_session
    FROM events
)
SELECT
    user_id,
    event_time,
    SUM(new_session) OVER (PARTITION BY user_id ORDER BY event_time) as session_id
FROM events_with_gap;
```

### Deduplication with Row Number

```sql
-- Keep most recent record per email
DELETE FROM users
WHERE id NOT IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) as rn
        FROM users
    ) t WHERE rn = 1
);
```
