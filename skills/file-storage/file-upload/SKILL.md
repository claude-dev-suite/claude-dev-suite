---
name: file-upload
description: |
  Server-side file upload handling. Covers Multer (Node.js/Express), FastAPI
  UploadFile (Python), Spring MultipartFile (Java). File validation, streaming,
  size limits, and storage strategies.

  USE WHEN: user mentions "file upload", "multipart", "multer", "upload endpoint",
  "form data", "file validation", "image upload", "MultipartFile", "UploadFile"

  DO NOT USE FOR: cloud storage (S3/GCS/Azure) - use `cloud-storage`;
  file download/export - use `data-export`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# File Upload Handling

## Node.js (Multer — recommended)

```typescript
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

// Storage configuration
const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Single file
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ filename: req.file!.filename, size: req.file!.size });
});

// Multiple files
app.post('/upload/multiple', upload.array('files', 10), (req, res) => {
  res.json({ count: (req.files as Express.Multer.File[]).length });
});

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large' });
    return res.status(400).json({ error: err.message });
  }
  if (err.message.includes('not allowed')) return res.status(415).json({ error: err.message });
  next(err);
});
```

### Memory storage (for cloud forwarding)
```typescript
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), async (req, res) => {
  // req.file.buffer contains the file — forward to S3
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: req.file!.buffer, ContentType: req.file!.mimetype,
  }));
});
```

## Python (FastAPI)
```python
from fastapi import UploadFile, File, HTTPException
import aiofiles, uuid

ALLOWED_TYPES = {"image/jpeg", "image/png", "application/pdf"}
MAX_SIZE = 10 * 1024 * 1024  # 10MB

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, f"Type {file.content_type} not allowed")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(413, "File too large")

    filename = f"{uuid.uuid4()}{Path(file.filename).suffix}"
    async with aiofiles.open(f"uploads/{filename}", "wb") as f:
        await f.write(content)

    return {"filename": filename, "size": len(content)}
```

## Java (Spring Boot)
```java
@PostMapping("/upload")
public ResponseEntity<Map<String, String>> upload(
        @RequestParam("file") MultipartFile file) {

    if (file.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Empty file");
    if (file.getSize() > 10_000_000) throw new ResponseStatusException(PAYLOAD_TOO_LARGE);

    String ext = StringUtils.getFilenameExtension(file.getOriginalFilename());
    String filename = UUID.randomUUID() + "." + ext;
    Path dest = Path.of("uploads", filename);
    file.transferTo(dest);

    return ResponseEntity.ok(Map.of("filename", filename));
}
```

Spring config:
```yaml
spring:
  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 10MB
```

## File Validation Beyond MIME

```typescript
// Validate actual file content (magic bytes), not just extension
import { fileTypeFromBuffer } from 'file-type';

const type = await fileTypeFromBuffer(req.file!.buffer);
if (!type || !['image/jpeg', 'image/png'].includes(type.mime)) {
  return res.status(415).json({ error: 'Invalid file content' });
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Trust client MIME type only | Validate magic bytes with `file-type` |
| Original filename as storage key | Use UUID to prevent path traversal and collisions |
| No file size limit | Always set `limits.fileSize` |
| Sync disk writes on upload | Use streams or async writes |
| Storing uploads in app directory | Use separate `/uploads` or cloud storage |
| No cleanup of temp files | Implement lifecycle/cron cleanup |

## Production Checklist

- [ ] File size limits configured
- [ ] MIME type whitelist (validate magic bytes, not just extension)
- [ ] UUID filenames (never use original filename for storage)
- [ ] Multer error handler middleware
- [ ] Virus scanning for user uploads (ClamAV)
- [ ] Rate limiting on upload endpoints
- [ ] Cleanup strategy for orphaned files
