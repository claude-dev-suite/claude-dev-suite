---
name: pandas
description: |
  Python data processing with pandas, openpyxl, and lxml. Covers
  DataFrame operations, Excel I/O, XML parsing, bulk data transformation,
  and large-file handling. Use when processing tabular data, spreadsheets,
  or XML in Python.

  USE WHEN: user mentions "pandas", "DataFrame", "openpyxl", "read_excel",
  "lxml", "XPath", "CSV processing", "Excel parsing", "bulk data",
  "large file", "data transformation", "UTF-16", "codecs"

  DO NOT USE FOR: SQL databases (use sql-expert), NumPy-only math, ML/training
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Data Processing: pandas, openpyxl, lxml

## pandas Essentials

### Reading Data

```python
import pandas as pd

# CSV (handle various separators, encodings)
df = pd.read_csv("data.csv", sep=';', encoding='utf-8')
df = pd.read_csv("data.csv", sep=';', encoding='utf-16', dtype_backend='numpy_nullable')

# Excel
df = pd.read_excel("data.xlsx", sheet_name="Motors", header=0)
df = pd.read_excel("data.xlsx", sheet_name=0, usecols="A:F", nrows=500)

# Chunked reading for large files
for chunk in pd.read_csv("large.csv", sep=';', chunksize=10_000):
    process(chunk)
```

### Selection and Filtering

```python
# Column selection
df['tag']                         # Series
df[['tag', 'area', 'power_kw']]   # DataFrame

# Row selection
df.loc[df['area'] == 11301]                    # boolean mask
df.loc[df['area'].isin([11301, 11090])]        # multiple values
df.loc[(df['area'] == 11301) & (df['active'])] # combined

# Positional
df.iloc[0]           # first row
df.iloc[0:10, 0:3]   # slice rows and columns
```

### Data Transformation

```python
# Vectorized operations (fast — avoid .apply() for simple ops)
df['normalized'] = df['value'] / df['value'].max()
df['tag_upper'] = df['tag'].str.upper().str.strip()
df['area_str'] = df['area'].astype(str)

# Apply (for complex per-row logic)
df['node_name'] = df.apply(
    lambda r: f"{r['area']}{r['equip_code']}{r['number']}", axis=1
)

# Map (for value replacement)
df['type_label'] = df['type_code'].map({'M': 'Motor', 'V': 'Valve', 'P': 'PID'})
```

### Aggregation

```python
# Group and aggregate
summary = df.groupby('area').agg(
    count=('tag', 'count'),
    total_power=('power_kw', 'sum'),
    max_power=('power_kw', 'max'),
)

# Pivot table
pivot = df.pivot_table(
    values='power_kw', index='area', columns='type', aggfunc='sum', fill_value=0
)
```

### Merge / Join

```python
# Merge on key (like SQL JOIN)
result = pd.merge(df_tags, df_params, on='tag', how='left')
result = pd.merge(df_tags, df_params, left_on='tag', right_on='TagName', how='inner')

# Concat (stack DataFrames)
combined = pd.concat([df1, df2, df3], ignore_index=True)
```

### Writing Data

```python
# CSV
df.to_csv("output.csv", index=False, sep=';', encoding='utf-8')

# Excel
df.to_excel("output.xlsx", sheet_name="Tags", index=False)

# Multiple sheets
with pd.ExcelWriter("report.xlsx", engine='openpyxl') as writer:
    df_motors.to_excel(writer, sheet_name="Motors", index=False)
    df_valves.to_excel(writer, sheet_name="Valves", index=False)
```

### Performance Tips

```python
# Use categoricals for low-cardinality strings
df['area'] = df['area'].astype('category')
df['type'] = df['type'].astype('category')

# Downcast numerics
df['count'] = pd.to_numeric(df['count'], downcast='integer')
df['value'] = pd.to_numeric(df['value'], downcast='float')

# Avoid object dtype for mixed types — specify explicitly
df = pd.read_csv(path, dtype={'area': int, 'tag': str, 'value': float})

# Use .loc for assignment (avoid SettingWithCopyWarning)
df.loc[mask, 'col'] = value
```

---

## openpyxl — Excel Read/Write

### Read with openpyxl

```python
from openpyxl import load_workbook

# Read-only for large files
wb = load_workbook("data.xlsx", read_only=True, data_only=True)
ws = wb["Motors"]

# Iterate rows (skipping header)
for row in ws.iter_rows(min_row=2, values_only=True):
    tag, desc, area, power = row[0], row[1], row[2], row[3]

# Named ranges
cell_range = wb.defined_names["motor_list"]
for title, coord in cell_range.destinations:
    ws = wb[title]
    for row in ws[coord]:
        print([cell.value for cell in row])

wb.close()
```

### Write with openpyxl

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

wb = Workbook()
ws = wb.active
ws.title = "Generated Tags"

# Header row with style
headers = ["Tag", "Description", "Area", "Power (kW)"]
for col, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col, value=header)
    cell.font = Font(bold=True)
    cell.fill = PatternFill(fill_type="solid", fgColor="4472C4")
    cell.font = Font(bold=True, color="FFFFFF")

# Data rows
for i, row_data in enumerate(rows, 2):
    for col, value in enumerate(row_data, 1):
        ws.cell(row=i, column=col, value=value)

# Column widths
ws.column_dimensions['A'].width = 25
ws.column_dimensions['B'].width = 40

wb.save("output.xlsx")
```

---

## lxml — XML/HTML Parsing

### Parse XML

```python
from lxml import etree

# Parse from file
tree = etree.parse("config.xml")
root = tree.getroot()

# Parse from string
root = etree.fromstring(b"<root><item id='1'>text</item></root>")

# XPath without namespaces
items = root.xpath("//item[@id]")
texts = root.xpath("//item/text()")

# XPath with namespaces
ns = {'plc': 'http://www.plcopen.org/xml/tc6_0201'}
pous = root.xpath("//plc:pou", namespaces=ns)
```

### Build XML

```python
from lxml import etree

def build_tag_xml(tags: list[dict]) -> bytes:
    root = etree.Element("TagList")
    for tag_data in tags:
        tag_el = etree.SubElement(root, "Tag")
        tag_el.set("name", tag_data["name"])
        tag_el.set("area", str(tag_data["area"]))
        desc_el = etree.SubElement(tag_el, "Description")
        desc_el.text = tag_data.get("description", "")
    return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding="UTF-8")
```

### Namespace Handling

```python
# Strip namespace prefixes for simpler XPath
def strip_ns(tree: etree._Element) -> etree._Element:
    for el in tree.iter():
        if el.tag.startswith('{'):
            el.tag = el.tag.split('}', 1)[1]
    return tree

# Or use Clark notation in XPath
ns = {'ns': 'http://example.com/schema'}
elements = root.xpath('/ns:root/ns:items/ns:item', namespaces=ns)
```

---

## File Encoding Handling

### UTF-16LE (industrial formats: ABB Freelance, etc.)

```python
import codecs

def read_utf16(path: str) -> str:
    """Auto-detect UTF-16 LE/BE via BOM."""
    with codecs.open(path, 'r', 'utf-16') as f:
        return f.read()

def write_utf16le(path: str, content: str) -> None:
    """Write UTF-16LE with BOM (required by ABB Freelance)."""
    with codecs.open(path, 'w', 'utf-16-le') as f:
        f.write('\ufeff' + content)  # \ufeff = UTF-16LE BOM

def detect_encoding(path: str) -> str:
    """Detect encoding via BOM bytes."""
    with open(path, 'rb') as f:
        bom = f.read(4)
    if bom.startswith(b'\xff\xfe'):
        return 'utf-16-le'
    elif bom.startswith(b'\xfe\xff'):
        return 'utf-16-be'
    elif bom.startswith(b'\xef\xbb\xbf'):
        return 'utf-8-sig'
    return 'utf-8'
```

---

## Common Patterns

### Template-Based Bulk File Generation

```python
import codecs
import re

def generate_instances(template_path: str, rows: list[dict], output_dir: str) -> list[str]:
    template = read_utf16(template_path)
    generated = []

    for row in rows:
        content = template
        for placeholder, value in row.items():
            content = content.replace(f"{{{placeholder}}}", str(value))
        # Reset checksum
        content = re.sub(r'\[CHECKSUM\];.*', '[CHECKSUM];0000000000', content)

        out_path = f"{output_dir}/{row['node_name']}.prt"
        write_utf16le(out_path, content)
        generated.append(out_path)

    return generated
```

### Validate Excel Input Before Processing

```python
REQUIRED_COLUMNS = {'tag', 'description', 'area', 'power_kw'}

def validate_input_excel(path: str, sheet: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=sheet)
    df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df = df.dropna(subset=['tag'])  # drop rows without tag
    df['area'] = pd.to_numeric(df['area'], errors='coerce').astype('Int64')

    invalid = df[df['area'].isna()]
    if not invalid.empty:
        raise ValueError(f"{len(invalid)} rows with invalid area code")

    return df
```
