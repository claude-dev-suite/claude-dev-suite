---
name: image-processing
description: |
  Image processing and optimization. Sharp (Node.js), Pillow (Python),
  Cloudinary, responsive images, WebP/AVIF conversion, thumbnails,
  and CDN-based image transformation.

  USE WHEN: user mentions "image resize", "thumbnail", "image optimization",
  "Sharp", "Pillow", "Cloudinary", "WebP", "AVIF", "image upload processing"

  DO NOT USE FOR: file upload handling - use `file-upload`;
  cloud storage - use `cloud-storage`; PDF generation - use `pdf-generation`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Image Processing

## Sharp (Node.js — recommended)

```typescript
import sharp from 'sharp';

// Resize and convert
async function processUpload(input: Buffer, filename: string) {
  const variants = await Promise.all([
    sharp(input).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer(),
    sharp(input).resize(400, 400, { fit: 'cover' })
      .webp({ quality: 75 }).toBuffer(),
    sharp(input).resize(100, 100, { fit: 'cover' })
      .webp({ quality: 70 }).toBuffer(),
  ]);

  return {
    original: { buffer: variants[0], key: `images/${filename}.webp` },
    medium: { buffer: variants[1], key: `images/${filename}-400.webp` },
    thumb: { buffer: variants[2], key: `images/${filename}-100.webp` },
  };
}
```

### Express Upload Pipeline

```typescript
import multer from 'multer';

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

app.post('/api/images', upload.single('image'), async (req, res) => {
  // Validate image type
  const metadata = await sharp(req.file!.buffer).metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format!)) {
    return res.status(400).json({ error: 'Invalid image format' });
  }

  const variants = await processUpload(req.file!.buffer, uuid());

  // Upload to S3
  await Promise.all(Object.values(variants).map((v) =>
    s3.putObject({ Bucket: BUCKET, Key: v.key, Body: v.buffer, ContentType: 'image/webp' })
  ));

  res.json({ url: `${CDN_URL}/${variants.original.key}` });
});
```

## Cloudinary (managed service)

```typescript
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

// Upload with auto-optimization
const result = await cloudinary.uploader.upload(filePath, {
  folder: 'products',
  transformation: [
    { width: 1200, height: 1200, crop: 'limit' },
    { quality: 'auto', fetch_format: 'auto' },
  ],
});

// URL-based transformations
const thumbUrl = cloudinary.url(result.public_id, {
  width: 200, height: 200, crop: 'fill', gravity: 'face',
  quality: 'auto', format: 'webp',
});
```

## Python (Pillow)

```python
from PIL import Image
from io import BytesIO

def process_image(data: bytes, max_size: int = 1200) -> bytes:
    img = Image.open(BytesIO(data))
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    if img.mode in ('RGBA', 'P'):
        img = img.convert('RGB')

    output = BytesIO()
    img.save(output, format='WEBP', quality=80)
    return output.getvalue()
```

## Responsive Images (HTML)

```html
<picture>
  <source srcset="/images/hero-400.webp 400w, /images/hero-800.webp 800w, /images/hero-1200.webp 1200w"
          sizes="(max-width: 600px) 400px, (max-width: 1024px) 800px, 1200px"
          type="image/webp" />
  <img src="/images/hero-800.jpg" alt="Hero image" loading="lazy" decoding="async" />
</picture>
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Processing in request handler | Process in background job queue |
| Storing only original size | Generate multiple sizes on upload |
| No format conversion | Convert to WebP/AVIF for smaller size |
| No file size validation | Validate before processing |
| Serving images from app server | Use CDN or cloud storage |

## Production Checklist

- [ ] Image processing in background queue
- [ ] Multiple sizes generated (thumb, medium, full)
- [ ] WebP/AVIF conversion for modern browsers
- [ ] CDN for serving images
- [ ] File type and size validation
- [ ] Metadata stripping for privacy
