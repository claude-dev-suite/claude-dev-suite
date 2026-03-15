# Oracle Partitioning Quick Reference

## Partitioning Types

| Type | Use Case | Key Column |
|------|----------|------------|
| Range | Time-series, numeric ranges | DATE, NUMBER |
| List | Categories, regions | VARCHAR2, NUMBER |
| Hash | Even distribution | Any |
| Composite | Multiple strategies | Multiple columns |
| Interval | Auto-create range partitions | DATE, NUMBER |
| Reference | Child follows parent | FK relationship |

## Range Partitioning

```sql
CREATE TABLE sales (
    sale_id NUMBER,
    sale_date DATE,
    amount NUMBER(10,2),
    region VARCHAR2(20)
)
PARTITION BY RANGE (sale_date) (
    PARTITION p_2022_q1 VALUES LESS THAN (DATE '2022-04-01'),
    PARTITION p_2022_q2 VALUES LESS THAN (DATE '2022-07-01'),
    PARTITION p_2022_q3 VALUES LESS THAN (DATE '2022-10-01'),
    PARTITION p_2022_q4 VALUES LESS THAN (DATE '2023-01-01'),
    PARTITION p_2023_q1 VALUES LESS THAN (DATE '2023-04-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

-- Multi-column range
CREATE TABLE orders (
    order_id NUMBER,
    order_year NUMBER,
    order_month NUMBER,
    amount NUMBER
)
PARTITION BY RANGE (order_year, order_month) (
    PARTITION p_2024_01 VALUES LESS THAN (2024, 2),
    PARTITION p_2024_02 VALUES LESS THAN (2024, 3),
    PARTITION p_future VALUES LESS THAN (MAXVALUE, MAXVALUE)
);
```

## Interval Partitioning

```sql
-- Auto-create monthly partitions
CREATE TABLE sales (
    sale_id NUMBER,
    sale_date DATE,
    amount NUMBER(10,2)
)
PARTITION BY RANGE (sale_date)
INTERVAL (NUMTOYMINTERVAL(1, 'MONTH')) (
    PARTITION p_initial VALUES LESS THAN (DATE '2024-01-01')
);

-- Daily partitions
CREATE TABLE logs (
    log_id NUMBER,
    log_date DATE,
    message VARCHAR2(4000)
)
PARTITION BY RANGE (log_date)
INTERVAL (NUMTODSINTERVAL(1, 'DAY')) (
    PARTITION p_initial VALUES LESS THAN (DATE '2024-01-01')
);

-- Numeric interval
CREATE TABLE measurements (
    id NUMBER,
    value NUMBER
)
PARTITION BY RANGE (value)
INTERVAL (1000) (
    PARTITION p_initial VALUES LESS THAN (1000)
);
```

## List Partitioning

```sql
CREATE TABLE customers (
    customer_id NUMBER,
    region VARCHAR2(20),
    name VARCHAR2(100)
)
PARTITION BY LIST (region) (
    PARTITION p_north VALUES ('NY', 'MA', 'CT', 'NH'),
    PARTITION p_south VALUES ('FL', 'GA', 'TX', 'NC'),
    PARTITION p_west VALUES ('CA', 'WA', 'OR', 'AZ'),
    PARTITION p_midwest VALUES ('IL', 'OH', 'MI', 'IN'),
    PARTITION p_other VALUES (DEFAULT)
);

-- Multi-column list (12c+)
CREATE TABLE products (
    product_id NUMBER,
    category VARCHAR2(20),
    subcategory VARCHAR2(20)
)
PARTITION BY LIST (category, subcategory) (
    PARTITION p_electronics_phones VALUES (('Electronics', 'Phones')),
    PARTITION p_electronics_computers VALUES (('Electronics', 'Computers')),
    PARTITION p_other VALUES (DEFAULT)
);
```

## Hash Partitioning

```sql
-- By number of partitions
CREATE TABLE transactions (
    txn_id NUMBER,
    customer_id NUMBER,
    amount NUMBER
)
PARTITION BY HASH (customer_id)
PARTITIONS 8;

-- Named partitions
CREATE TABLE transactions (
    txn_id NUMBER,
    customer_id NUMBER,
    amount NUMBER
)
PARTITION BY HASH (customer_id) (
    PARTITION p1 TABLESPACE ts1,
    PARTITION p2 TABLESPACE ts2,
    PARTITION p3 TABLESPACE ts3,
    PARTITION p4 TABLESPACE ts4
);
```

## Composite Partitioning

```sql
-- Range-Hash
CREATE TABLE sales (
    sale_id NUMBER,
    sale_date DATE,
    customer_id NUMBER,
    amount NUMBER
)
PARTITION BY RANGE (sale_date)
SUBPARTITION BY HASH (customer_id) SUBPARTITIONS 4 (
    PARTITION p_2024_q1 VALUES LESS THAN (DATE '2024-04-01'),
    PARTITION p_2024_q2 VALUES LESS THAN (DATE '2024-07-01'),
    PARTITION p_2024_q3 VALUES LESS THAN (DATE '2024-10-01'),
    PARTITION p_2024_q4 VALUES LESS THAN (DATE '2025-01-01')
);

-- Range-List
CREATE TABLE orders (
    order_id NUMBER,
    order_date DATE,
    region VARCHAR2(20),
    amount NUMBER
)
PARTITION BY RANGE (order_date)
SUBPARTITION BY LIST (region)
SUBPARTITION TEMPLATE (
    SUBPARTITION north VALUES ('NY', 'MA'),
    SUBPARTITION south VALUES ('FL', 'TX'),
    SUBPARTITION west VALUES ('CA', 'WA'),
    SUBPARTITION other VALUES (DEFAULT)
) (
    PARTITION p_2024_q1 VALUES LESS THAN (DATE '2024-04-01'),
    PARTITION p_2024_q2 VALUES LESS THAN (DATE '2024-07-01')
);
```

## Reference Partitioning

```sql
-- Parent table
CREATE TABLE orders (
    order_id NUMBER PRIMARY KEY,
    order_date DATE,
    customer_id NUMBER
)
PARTITION BY RANGE (order_date) (
    PARTITION p_2024_q1 VALUES LESS THAN (DATE '2024-04-01'),
    PARTITION p_2024_q2 VALUES LESS THAN (DATE '2024-07-01')
);

-- Child follows parent partitioning
CREATE TABLE order_items (
    item_id NUMBER,
    order_id NUMBER NOT NULL,
    product_id NUMBER,
    quantity NUMBER,
    CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders(order_id)
)
PARTITION BY REFERENCE (fk_order);
```

## Partition Operations

### Add Partition

```sql
ALTER TABLE sales ADD PARTITION p_2025_q1
    VALUES LESS THAN (DATE '2025-04-01');
```

### Drop Partition

```sql
ALTER TABLE sales DROP PARTITION p_2022_q1;

-- With UPDATE INDEXES
ALTER TABLE sales DROP PARTITION p_2022_q1 UPDATE INDEXES;
```

### Truncate Partition

```sql
ALTER TABLE sales TRUNCATE PARTITION p_2022_q1;

-- Drop storage
ALTER TABLE sales TRUNCATE PARTITION p_2022_q1 DROP STORAGE;
```

### Split Partition

```sql
ALTER TABLE sales SPLIT PARTITION p_future
    AT (DATE '2025-01-01')
    INTO (PARTITION p_2024_q4, PARTITION p_future);
```

### Merge Partitions

```sql
ALTER TABLE sales MERGE PARTITIONS p_2022_q1, p_2022_q2
    INTO PARTITION p_2022_h1;
```

### Exchange Partition

```sql
-- Swap partition with staging table
CREATE TABLE sales_staging AS SELECT * FROM sales WHERE 1=0;
-- Load data into staging...

ALTER TABLE sales EXCHANGE PARTITION p_2024_q1
    WITH TABLE sales_staging
    INCLUDING INDEXES;
```

### Move Partition

```sql
ALTER TABLE sales MOVE PARTITION p_2024_q1
    TABLESPACE new_tablespace;
```

## Partition Indexes

### Local Index

```sql
-- One index partition per table partition
CREATE INDEX idx_sales_amount ON sales(amount) LOCAL;

-- With partition-specific storage
CREATE INDEX idx_sales_amount ON sales(amount) LOCAL (
    PARTITION p_2024_q1 TABLESPACE idx_ts1,
    PARTITION p_2024_q2 TABLESPACE idx_ts2
);
```

### Global Index

```sql
-- Spans all partitions
CREATE INDEX idx_sales_customer ON sales(customer_id) GLOBAL;

-- Partitioned differently than table
CREATE INDEX idx_sales_customer ON sales(customer_id)
    GLOBAL PARTITION BY RANGE (customer_id) (
        PARTITION p1 VALUES LESS THAN (10000),
        PARTITION p2 VALUES LESS THAN (MAXVALUE)
    );
```

## Query Partitions

```sql
-- Query specific partition
SELECT * FROM sales PARTITION (p_2024_q1);

-- Query specific subpartition
SELECT * FROM sales SUBPARTITION (p_2024_q1_north);

-- Partition pruning (automatic with predicate)
SELECT * FROM sales WHERE sale_date >= DATE '2024-01-01'
                      AND sale_date < DATE '2024-04-01';
```

## Metadata

```sql
-- View partitions
SELECT partition_name, high_value, num_rows
FROM user_tab_partitions
WHERE table_name = 'SALES';

-- View subpartitions
SELECT partition_name, subpartition_name
FROM user_tab_subpartitions
WHERE table_name = 'SALES';

-- Partition statistics
SELECT partition_name, num_rows, blocks, avg_row_len
FROM user_tab_partitions
WHERE table_name = 'SALES';
```
