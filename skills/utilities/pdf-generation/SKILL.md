---
name: pdf-generation
description: |
  PDF generation and manipulation. Puppeteer/Playwright HTML-to-PDF, PDFKit,
  jsPDF, React-PDF, iText (Java), ReportLab (Python). Invoices, reports,
  and document generation.

  USE WHEN: user mentions "PDF", "generate PDF", "HTML to PDF", "invoice PDF",
  "PDFKit", "jsPDF", "Puppeteer PDF", "React-PDF", "iText", "ReportLab"

  DO NOT USE FOR: PDF parsing/reading - different concern;
  image generation - different format
allowed-tools: Read, Grep, Glob, Write, Edit
---
# PDF Generation

## Puppeteer HTML-to-PDF (recommended for complex layouts)

```typescript
import puppeteer from 'puppeteer';

async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdf = await page.pdf({
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    printBackground: true,
  });

  await browser.close();
  return Buffer.from(pdf);
}

// Express endpoint
app.get('/api/invoice/:id/pdf', async (req, res) => {
  const invoice = await getInvoice(req.params.id);
  const html = renderInvoiceHtml(invoice);
  const pdf = await generatePdf(html);
  res.contentType('application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.number}.pdf"`);
  res.send(pdf);
});
```

## PDFKit (Node.js — programmatic)

```typescript
import PDFDocument from 'pdfkit';

function createInvoicePdf(invoice: Invoice): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // Header
    doc.fontSize(20).text('INVOICE', { align: 'right' });
    doc.fontSize(10).text(`#${invoice.number}`, { align: 'right' });
    doc.moveDown();

    // Table
    doc.fontSize(12).text('Item', 50, doc.y);
    doc.text('Amount', 400, doc.y - 12, { width: 100, align: 'right' });
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

    for (const item of invoice.items) {
      doc.text(item.description, 50, doc.y + 5);
      doc.text(`$${item.amount.toFixed(2)}`, 400, doc.y - 12, { width: 100, align: 'right' });
    }

    doc.end();
  });
}
```

## @react-pdf/renderer (React components to PDF)

```tsx
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 30 },
  title: { fontSize: 24, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
});

function InvoicePdf({ invoice }: { invoice: Invoice }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Invoice #{invoice.number}</Text>
        {invoice.items.map((item) => (
          <View key={item.id} style={styles.row}>
            <Text>{item.description}</Text>
            <Text>${item.amount.toFixed(2)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

// Server-side render
const buffer = await renderToBuffer(<InvoicePdf invoice={invoice} />);
```

## Python (ReportLab)

```python
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, Paragraph
from reportlab.lib.styles import getSampleStyleSheet

def generate_invoice_pdf(invoice: dict, output_path: str):
    doc = SimpleDocTemplate(output_path, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"Invoice #{invoice['number']}", styles['Title']))

    data = [['Item', 'Amount']]
    for item in invoice['items']:
        data.append([item['description'], f"${item['amount']:.2f}"])

    table = Table(data, colWidths=[350, 100])
    elements.append(table)
    doc.build(elements)
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| New browser per PDF request | Reuse browser instance, create new pages |
| No timeout on PDF generation | Set `page.setDefaultTimeout()` and abort |
| Generating PDFs synchronously in request | Use background job queue |
| Inline CSS in HTML templates | Use embedded `<style>` or `printBackground: true` |
| No memory cleanup | Close pages after use, limit concurrent generations |

## Production Checklist

- [ ] Browser instance pooling (Puppeteer/Playwright)
- [ ] PDF generation in background queue
- [ ] Memory limits and timeouts configured
- [ ] Generated PDFs stored in object storage (S3)
- [ ] Content-Disposition header for downloads
- [ ] PDF/A compliance if archiving required
