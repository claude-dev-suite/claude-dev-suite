---
name: apache-poi
description: |
  Apache POI for Excel file manipulation in Java applications.

  USE WHEN: user mentions "Apache POI", "Excel generation", asks about "Java Excel", "XLSX export", "Excel import", "POI workbook", "spreadsheet generation"

  DO NOT USE FOR: CSV files - use OpenCSV or standard Java CSV libraries
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Apache POI - Quick Reference

## When NOT to Use This Skill

- **CSV files** - Use OpenCSV, Apache Commons CSV, or `Files.lines()` for CSV
- **PDF generation** - Use Apache PDFBox or iText instead
- **Large Excel files (> 100k rows)** - Use `SXSSFWorkbook` or consider CSV export
- **Excel formulas/macros** - POI has limited macro support; consider VBA alternatives
- **Real-time Excel editing** - POI is for generation/parsing, not collaborative editing

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `apache-poi` for comprehensive API documentation, advanced formatting, and formula handling.

## Pattern Essenziali

### Maven
```xml
<dependency>
    <groupId>org.apache.poi</groupId>
    <artifactId>poi-ooxml</artifactId>
    <version>5.2.5</version>
</dependency>
```

### Create Excel
```java
try (Workbook workbook = new XSSFWorkbook()) {
    Sheet sheet = workbook.createSheet("Data");

    // Header
    Row header = sheet.createRow(0);
    header.createCell(0).setCellValue("Name");
    header.createCell(1).setCellValue("Email");

    // Data
    Row row = sheet.createRow(1);
    row.createCell(0).setCellValue("John");
    row.createCell(1).setCellValue("john@email.com");

    // Auto-size
    sheet.autoSizeColumn(0);
    sheet.autoSizeColumn(1);

    // Write
    workbook.write(new FileOutputStream("output.xlsx"));
}
```

### Export Service
```java
@Service
public class ExportService {
    public byte[] exportToExcel(List<User> users) throws IOException {
        try (Workbook wb = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Users");
            // ... populate rows
            wb.write(out);
            return out.toByteArray();
        }
    }
}
```

### REST Download Endpoint
```java
@GetMapping("/export")
public ResponseEntity<byte[]> export() throws IOException {
    byte[] data = exportService.exportToExcel(users);
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=data.xlsx")
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .body(data);
}
```

## Cell Styles
```java
CellStyle headerStyle = workbook.createCellStyle();
Font font = workbook.createFont();
font.setBold(true);
headerStyle.setFont(font);
cell.setCellStyle(headerStyle);
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| Not closing workbook | Memory leak, file locks | Use try-with-resources: `try (Workbook wb = new XSSFWorkbook())` |
| Creating styles in loops | Workbook has max 64,000 styles limit | Create styles once, reuse across cells |
| Using `XSSFWorkbook` for large files | OutOfMemoryError for > 100k rows | Use `SXSSFWorkbook` for streaming writes |
| Reading entire file into memory | Memory exhaustion on large files | Use event-based parsing (SAX) for reading |
| Not setting cell types | Data interpreted incorrectly | Explicitly set cell type: `cell.setCellType(CellType.NUMERIC)` |
| Using `autoSizeColumn()` for every column | Very slow, especially with many rows | Manually set widths or use sparingly |
| Hardcoding column indices | Brittle, breaks on column changes | Use constants or column name maps |
| Generating Excel for large datasets | Excel has 1M row limit, slow | Consider CSV or database export instead |

## Quick Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| `OutOfMemoryError` on large Excel | Using `XSSFWorkbook`, all data in memory | Switch to `SXSSFWorkbook` for streaming |
| `IllegalStateException: Cannot get a STRING value from a NUMERIC cell` | Wrong cell type getter | Check type with `cell.getCellType()` before reading |
| File corrupted after generation | Workbook not closed properly | Use try-with-resources or explicitly call `wb.close()` |
| Styles not applying | Exceeding 64,000 style limit | Reuse CellStyle objects, don't create in loops |
| Numbers displayed as text in Excel | Cell type not set | Use `cell.setCellType(CellType.NUMERIC)` and set value as number |
| Formula not calculating | Formula mode not set | Use `cell.setCellFormula("SUM(A1:A10)")` or force recalc |
| Very slow generation | `autoSizeColumn()` on large sheets | Remove or call only on critical columns |
| Date formatting incorrect | Default format not desired | Create date CellStyle with custom format |

## Related Skills

- [Spring Boot](../../backend-frameworks/spring-boot/SKILL.md)
- [Java](../../languages/java/SKILL.md)

## References
- [Apache POI Official Docs](https://poi.apache.org/)
