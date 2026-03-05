---
name: data-export
description: |
  Data export to CSV, Excel (XLSX), and JSON. ExcelJS, SheetJS (xlsx),
  Papa Parse, Apache POI (Java), openpyxl (Python). Streaming exports
  for large datasets.

  USE WHEN: user mentions "export CSV", "export Excel", "XLSX generation",
  "download spreadsheet", "ExcelJS", "SheetJS", "Papa Parse", "data export"

  DO NOT USE FOR: PDF generation - use `pdf-generation`;
  file upload/download - use `file-upload`/`cloud-storage`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Data Export

## CSV Export (Node.js)

```typescript
import { stringify } from 'csv-stringify';
import { pipeline } from 'stream/promises';

// Streaming CSV (handles large datasets)
app.get('/api/export/users.csv', async (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');

  const cursor = db.collection('users').find().cursor();
  const csvStringifier = stringify({
    header: true,
    columns: ['name', 'email', 'createdAt'],
  });

  await pipeline(cursor, csvStringifier, res);
});

// Simple in-memory CSV
import { stringify } from 'csv-stringify/sync';

const csv = stringify(rows, { header: true, columns: ['name', 'email', 'amount'] });
```

## Excel Export (ExcelJS — recommended)

```typescript
import ExcelJS from 'exceljs';

app.get('/api/export/report.xlsx', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');

  // Headers with styling
  sheet.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Amount', key: 'amount', width: 15 },
  ];
  sheet.getRow(1).font = { bold: true };

  // Data
  const users = await getUsers();
  users.forEach((u) => sheet.addRow(u));

  // Number formatting
  sheet.getColumn('amount').numFmt = '$#,##0.00';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="report.xlsx"');
  await workbook.xlsx.write(res);
});
```

### Streaming Excel for Large Datasets

```typescript
const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
const sheet = workbook.addWorksheet('Data');
sheet.columns = [{ header: 'Name', key: 'name' }, { header: 'Value', key: 'value' }];

for await (const row of cursor) {
  sheet.addRow(row).commit(); // Flushes row to stream
}

await workbook.commit();
```

## Frontend CSV Parsing (Papa Parse)

```typescript
import Papa from 'papaparse';

// Parse uploaded CSV
const result = Papa.parse<UserRow>(file, {
  header: true,
  skipEmptyLines: true,
  dynamicTyping: true,
  complete: (results) => {
    console.log(results.data);   // Parsed rows
    console.log(results.errors); // Parse errors
  },
});

// Generate CSV in browser
const csv = Papa.unparse(data);
const blob = new Blob([csv], { type: 'text/csv' });
const url = URL.createObjectURL(blob);
```

## Python (openpyxl)

```python
from openpyxl import Workbook
from io import BytesIO

def export_excel(data: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Report"

    headers = list(data[0].keys())
    ws.append(headers)
    for row in data:
        ws.append([row[h] for h in headers])

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Loading all data into memory | Stream from DB cursor for large exports |
| No Content-Disposition header | Always set for browser download |
| Generating exports in request handler | Use background job for >10K rows |
| No progress indication | Use WebSocket/SSE for large export progress |
| Unescaped CSV values | Use library (csv-stringify, Papa Parse) |

## Production Checklist

- [ ] Streaming for datasets >10K rows
- [ ] Background job queue for large exports
- [ ] Proper Content-Type and Content-Disposition headers
- [ ] Memory limits monitored
- [ ] Rate limiting on export endpoints
- [ ] Temporary file cleanup if writing to disk
