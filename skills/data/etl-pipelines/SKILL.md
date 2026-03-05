---
name: etl-pipelines
description: |
  ETL/ELT data pipeline patterns. Extract from APIs/databases, transform
  with streaming or batch, load to data warehouses. Node.js streams, Python
  pandas/Polars, Apache Airflow DAGs, and database-native ELT.

  USE WHEN: user mentions "ETL", "ELT", "data pipeline", "data ingestion",
  "Airflow", "data warehouse", "batch processing", "data migration"

  DO NOT USE FOR: real-time event streaming - use messaging skills;
  data export to CSV/Excel - use `data-export`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ETL/ELT Pipelines

## Node.js Streaming ETL

```typescript
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);

// Extract → Transform → Load
await pipelineAsync(
  // Extract: read from source
  db.query('SELECT * FROM legacy_orders').stream(),

  // Transform
  new Transform({
    objectMode: true,
    transform(row, _, callback) {
      callback(null, {
        id: row.order_id,
        customer: row.cust_name.trim(),
        amount: parseFloat(row.total_amount),
        date: new Date(row.order_date).toISOString(),
      });
    },
  }),

  // Load: batch insert to destination
  new BatchWriter(targetDb, 'orders', { batchSize: 1000 }),
);
```

### Batch Writer

```typescript
class BatchWriter extends Writable {
  private batch: any[] = [];

  constructor(private db: Database, private table: string, private opts: { batchSize: number }) {
    super({ objectMode: true });
  }

  async _write(record: any, _: string, callback: () => void) {
    this.batch.push(record);
    if (this.batch.length >= this.opts.batchSize) {
      await this.flush();
    }
    callback();
  }

  async _final(callback: () => void) {
    if (this.batch.length > 0) await this.flush();
    callback();
  }

  private async flush() {
    await this.db.batchInsert(this.table, this.batch);
    this.batch = [];
  }
}
```

## Python (Polars — recommended for performance)

```python
import polars as pl

# Extract
df = pl.read_csv("data/legacy_orders.csv")
# Or from database:
# df = pl.read_database("SELECT * FROM orders", connection_uri)

# Transform
transformed = (
    df
    .with_columns([
        pl.col("customer_name").str.strip_chars().alias("customer"),
        pl.col("total_amount").cast(pl.Float64).alias("amount"),
        pl.col("order_date").str.to_datetime().alias("date"),
    ])
    .filter(pl.col("amount") > 0)
    .drop("customer_name", "total_amount", "order_date")
)

# Load
transformed.write_database("orders", connection_uri, if_table_exists="append")
# Or to Parquet for data lake:
transformed.write_parquet("output/orders.parquet")
```

## Apache Airflow DAG

```python
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from datetime import datetime, timedelta

default_args = {
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

with DAG('daily_order_sync', default_args=default_args,
         schedule_interval='0 2 * * *', start_date=datetime(2026, 1, 1),
         catchup=False) as dag:

    def extract(**context):
        hook = PostgresHook('source_db')
        df = hook.get_pandas_df("SELECT * FROM orders WHERE date = %(ds)s", parameters={'ds': context['ds']})
        context['ti'].xcom_push(key='row_count', value=len(df))
        df.to_parquet('/tmp/orders.parquet')

    def transform():
        import polars as pl
        df = pl.read_parquet('/tmp/orders.parquet')
        transformed = df.with_columns(pl.col("amount").cast(pl.Float64))
        transformed.write_parquet('/tmp/orders_clean.parquet')

    def load():
        hook = PostgresHook('warehouse_db')
        import polars as pl
        df = pl.read_parquet('/tmp/orders_clean.parquet')
        df.write_database('fact_orders', hook.get_uri(), if_table_exists='append')

    extract_task = PythonOperator(task_id='extract', python_callable=extract)
    transform_task = PythonOperator(task_id='transform', python_callable=transform)
    load_task = PythonOperator(task_id='load', python_callable=load)

    extract_task >> transform_task >> load_task
```

## Database-Native ELT

```sql
-- Extract + Load raw data, then transform in warehouse
-- Step 1: Load raw (use COPY or bulk insert)
COPY raw_orders FROM 's3://bucket/orders.csv' CREDENTIALS '...' CSV HEADER;

-- Step 2: Transform in place
INSERT INTO fact_orders (id, customer, amount, order_date)
SELECT order_id, TRIM(customer_name), CAST(total AS DECIMAL(10,2)), TO_DATE(date_str, 'YYYY-MM-DD')
FROM raw_orders
WHERE total > 0 AND NOT EXISTS (SELECT 1 FROM fact_orders WHERE id = raw_orders.order_id);
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Loading all data into memory | Use streaming (Node.js streams, generators) |
| No idempotency (re-runs duplicate data) | Use upserts or dedup before insert |
| No error handling per record | Log bad records, continue processing good ones |
| No data validation | Validate schema and types before loading |
| Monolithic ETL script | Split into extract, transform, load stages |

## Production Checklist

- [ ] Idempotent pipeline (safe to re-run)
- [ ] Bad record handling (dead letter, skip + log)
- [ ] Incremental processing (not full reload each time)
- [ ] Schema validation on input data
- [ ] Monitoring: records processed, errors, duration
- [ ] Backfill capability for historical data
