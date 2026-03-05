---
name: cloud-storage
description: |
  Cloud object storage integration with AWS S3, Azure Blob Storage, and Google
  Cloud Storage. Covers presigned URLs, multipart uploads, bucket policies,
  lifecycle rules, and CDN integration.

  USE WHEN: user mentions "S3", "blob storage", "cloud storage", "object storage",
  "presigned URL", "file upload to cloud", "GCS", "Azure Blob", "bucket"

  DO NOT USE FOR: local file uploads - use `file-upload`; database BLOB columns;
  local filesystem operations
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Cloud Object Storage

## AWS S3 (Recommended Default)

### Setup (SDK v3)
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION });
```

### Upload
```typescript
// Direct upload
await s3.send(new PutObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key: `uploads/${userId}/${filename}`,
  Body: buffer,
  ContentType: mimeType,
  Metadata: { 'uploaded-by': userId },
}));

// Presigned URL (client uploads directly to S3)
const url = await getSignedUrl(s3, new PutObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key: `uploads/${key}`,
  ContentType: mimeType,
}), { expiresIn: 3600 });
```

### Presigned Download
```typescript
const url = await getSignedUrl(s3, new GetObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key: fileKey,
}), { expiresIn: 3600 });
```

### Multipart Upload (large files)
```typescript
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// Simplified with lib-storage
const upload = new Upload({
  client: s3,
  params: { Bucket: bucket, Key: key, Body: readableStream },
  partSize: 10 * 1024 * 1024, // 10MB parts
  leavePartsOnError: false,
});
upload.on('httpUploadProgress', (progress) => console.log(progress));
await upload.done();
```

### Python (boto3)
```python
import boto3
from botocore.config import Config

s3 = boto3.client('s3', config=Config(signature_version='s3v4'))

# Upload
s3.upload_fileobj(file_obj, bucket, key, ExtraArgs={'ContentType': mime_type})

# Presigned URL
url = s3.generate_presigned_url('put_object',
    Params={'Bucket': bucket, 'Key': key, 'ContentType': mime_type},
    ExpiresIn=3600)
```

### Java (Spring)
```java
@Service
public class S3Service {
    private final S3Client s3;

    public String generatePresignedUploadUrl(String key, String contentType) {
        var presigner = S3Presigner.builder().region(Region.of(region)).build();
        var request = PutObjectPresignRequest.builder()
            .signatureDuration(Duration.ofHours(1))
            .putObjectRequest(b -> b.bucket(bucket).key(key).contentType(contentType))
            .build();
        return presigner.presignPutObject(request).url().toString();
    }
}
```

## Bucket Policy Patterns

### Public read for assets
```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/public/*"
  }]
}
```

### CORS for direct uploads
```json
{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST"],
    "AllowedOrigins": ["https://myapp.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }]
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Proxying large files through server | Use presigned URLs for direct client upload/download |
| No Content-Type on upload | Always set ContentType to enable correct browser behavior |
| Predictable file keys | Use UUIDs or hashed paths to prevent enumeration |
| No lifecycle rules | Set expiration for temp uploads, transition old files to Glacier |
| Long-lived presigned URLs | Keep expiry short (1h for uploads, 15m for downloads) |
| No multipart for large files | Use multipart upload for files > 100MB |

## Quick Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| 403 on presigned URL | Expired, wrong region, or CORS | Check expiry, region, CORS config |
| SignatureDoesNotMatch | ContentType mismatch | Ensure client sends same ContentType used in signing |
| Slow uploads | Single-part for large files | Use multipart upload with parallel parts |
| CORS errors | Missing CORS configuration | Add CORSRules to bucket |
| AccessDenied on public files | Missing bucket policy | Add public read policy for the prefix |

## Production Checklist

- [ ] Presigned URLs for all client uploads (never proxy large files)
- [ ] ContentType set on every upload
- [ ] UUID-based keys (prevent enumeration)
- [ ] CORS configured for direct uploads
- [ ] Lifecycle rules for temp/old files
- [ ] Encryption at rest enabled (SSE-S3 or SSE-KMS)
- [ ] Access logging enabled
- [ ] Versioning enabled for critical buckets
- [ ] CloudFront CDN for public assets
