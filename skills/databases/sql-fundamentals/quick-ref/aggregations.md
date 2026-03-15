# Aggregations Quick Reference

## Basic Aggregate Functions

| Function | Description |
|----------|-------------|
| `COUNT(*)` | Count all rows |
| `COUNT(column)` | Count non-NULL values |
| `COUNT(DISTINCT column)` | Count unique non-NULL values |
| `SUM(column)` | Sum of values |
| `AVG(column)` | Average of values |
| `MIN(column)` | Minimum value |
| `MAX(column)` | Maximum value |

```sql
SELECT
    COUNT(*) as total_orders,
    COUNT(shipped_at) as shipped_count,
    COUNT(DISTINCT user_id) as unique_customers,
    SUM(total) as revenue,
    AVG(total) as avg_order_value,
    MIN(total) as smallest_order,
    MAX(total) as largest_order
FROM orders;
```

## GROUP BY

```sql
-- Basic grouping
SELECT user_id, COUNT(*) as order_count, SUM(total) as total_spent
FROM orders
GROUP BY user_id;

-- Multiple columns
SELECT user_id, status, COUNT(*) as count
FROM orders
GROUP BY user_id, status;

-- With expressions
SELECT DATE_TRUNC('month', created_at) as month, SUM(total) as revenue
FROM orders
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month;

-- PostgreSQL: Group by column number
SELECT user_id, status, COUNT(*)
FROM orders
GROUP BY 1, 2;  -- refers to SELECT columns 1 and 2
```

## HAVING

Filter groups after aggregation (WHERE filters rows before).

```sql
-- Users with more than 5 orders
SELECT user_id, COUNT(*) as order_count
FROM orders
GROUP BY user_id
HAVING COUNT(*) > 5;

-- Categories with average price over $100
SELECT category_id, AVG(price) as avg_price
FROM products
GROUP BY category_id
HAVING AVG(price) > 100;

-- Combine WHERE and HAVING
SELECT user_id, SUM(total) as total_spent
FROM orders
WHERE status = 'completed'      -- filter rows
GROUP BY user_id
HAVING SUM(total) > 1000;       -- filter groups
```

## GROUPING SETS (Advanced)

Generate multiple groupings in one query.

```sql
-- Multiple groupings
SELECT category, brand, SUM(sales)
FROM products
GROUP BY GROUPING SETS (
    (category, brand),  -- by category and brand
    (category),         -- by category only
    (brand),            -- by brand only
    ()                  -- grand total
);

-- ROLLUP: hierarchical groupings
SELECT year, quarter, month, SUM(sales)
FROM sales
GROUP BY ROLLUP (year, quarter, month);
-- Produces: (year, quarter, month), (year, quarter), (year), ()

-- CUBE: all possible combinations
SELECT category, brand, SUM(sales)
FROM products
GROUP BY CUBE (category, brand);
-- Produces: (category, brand), (category), (brand), ()
```

## Window Functions

Perform calculations across rows related to current row.

### Syntax
```sql
function_name(args) OVER (
    [PARTITION BY columns]
    [ORDER BY columns]
    [frame_clause]
)
```

### Ranking Functions

```sql
SELECT
    name,
    department,
    salary,
    ROW_NUMBER() OVER (ORDER BY salary DESC) as row_num,
    RANK() OVER (ORDER BY salary DESC) as rank,
    DENSE_RANK() OVER (ORDER BY salary DESC) as dense_rank,
    NTILE(4) OVER (ORDER BY salary DESC) as quartile
FROM employees;

-- ROW_NUMBER: 1, 2, 3, 4, 5 (unique)
-- RANK:       1, 2, 2, 4, 5 (gaps after ties)
-- DENSE_RANK: 1, 2, 2, 3, 4 (no gaps)
-- NTILE(4):   1, 1, 2, 2, 3, 3, 4, 4 (distribute into n buckets)
```

### Partitioned Ranking

```sql
-- Rank within each department
SELECT
    name,
    department,
    salary,
    RANK() OVER (PARTITION BY department ORDER BY salary DESC) as dept_rank
FROM employees;

-- Top 3 per department
SELECT * FROM (
    SELECT
        name, department, salary,
        ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rn
    FROM employees
) ranked
WHERE rn <= 3;
```

### Value Functions

```sql
SELECT
    date,
    sales,
    LAG(sales, 1) OVER (ORDER BY date) as prev_day_sales,
    LEAD(sales, 1) OVER (ORDER BY date) as next_day_sales,
    FIRST_VALUE(sales) OVER (ORDER BY date) as first_sale,
    LAST_VALUE(sales) OVER (
        ORDER BY date
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as last_sale,
    NTH_VALUE(sales, 2) OVER (ORDER BY date) as second_sale
FROM daily_sales;

-- Calculate day-over-day change
SELECT
    date,
    sales,
    sales - LAG(sales) OVER (ORDER BY date) as change,
    ROUND(100.0 * (sales - LAG(sales) OVER (ORDER BY date)) /
          NULLIF(LAG(sales) OVER (ORDER BY date), 0), 2) as pct_change
FROM daily_sales;
```

### Aggregate Window Functions

```sql
SELECT
    date,
    sales,
    SUM(sales) OVER (ORDER BY date) as running_total,
    AVG(sales) OVER (ORDER BY date) as running_avg,
    SUM(sales) OVER () as grand_total,
    ROUND(100.0 * sales / SUM(sales) OVER (), 2) as pct_of_total
FROM daily_sales;

-- Moving average (last 7 days)
SELECT
    date,
    sales,
    AVG(sales) OVER (
        ORDER BY date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) as moving_avg_7d
FROM daily_sales;
```

### Frame Clauses

```sql
-- ROWS: physical rows
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW  -- default
ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING          -- 7-row window
ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING

-- RANGE: logical range (same values grouped)
RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
RANGE BETWEEN INTERVAL '7 days' PRECEDING AND CURRENT ROW  -- PostgreSQL

-- Examples
SELECT
    date,
    amount,
    -- Running sum
    SUM(amount) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING) as running_sum,
    -- 3-day moving sum
    SUM(amount) OVER (ORDER BY date ROWS 2 PRECEDING) as sum_3day,
    -- Future sum
    SUM(amount) OVER (ORDER BY date ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) as future_sum
FROM transactions;
```

### Named Window

```sql
SELECT
    name,
    department,
    salary,
    RANK() OVER w as rank,
    DENSE_RANK() OVER w as dense_rank,
    SUM(salary) OVER w as running_sum
FROM employees
WINDOW w AS (PARTITION BY department ORDER BY salary DESC);
```

## Common Patterns

### Running Totals
```sql
SELECT
    date,
    amount,
    SUM(amount) OVER (ORDER BY date) as balance
FROM transactions
ORDER BY date;
```

### Year-over-Year Comparison
```sql
SELECT
    EXTRACT(YEAR FROM date) as year,
    EXTRACT(MONTH FROM date) as month,
    SUM(sales) as sales,
    LAG(SUM(sales)) OVER (
        PARTITION BY EXTRACT(MONTH FROM date)
        ORDER BY EXTRACT(YEAR FROM date)
    ) as prev_year_sales
FROM daily_sales
GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date);
```

### Percentile
```sql
-- PostgreSQL
SELECT
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) as median,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY salary) as p90,
    PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY salary) as median_discrete
FROM employees;

-- As window function
SELECT
    department,
    salary,
    PERCENT_RANK() OVER (PARTITION BY department ORDER BY salary) as percentile
FROM employees;
```

### Gap Analysis
```sql
-- Find gaps in sequence
SELECT
    id,
    LEAD(id) OVER (ORDER BY id) as next_id,
    LEAD(id) OVER (ORDER BY id) - id as gap
FROM items
WHERE LEAD(id) OVER (ORDER BY id) - id > 1;
```
