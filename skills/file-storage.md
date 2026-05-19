# File Storage

> S3/R2 patterns, presigned URLs, multipart uploads, CDN integration, image processing, and virus scanning for secure file management.

## Core Principles

1. **Never Store Files in the Database** — Binary data in PostgreSQL causes bloat, backup issues, and memory pressure. Use object storage (S3, R2, GCS) for files, store metadata and references in the database.
2. **Presigned URLs for Direct Upload** — Clients should upload directly to object storage, never through your API server. Generate presigned URLs server-side, client uploads directly. This eliminates bandwidth and memory bottleneck on your API.
3. **Immutable Objects with Versioning** — Never overwrite files. Use content-addressed storage (hash-based keys) or versioned buckets. This enables audit trails, rollback, and cache-friendly CDN serving.
4. **Scan Before Serving** — All user-uploaded files must pass virus/malware scanning before being accessible. Quarantine uploads until scanned and approved.
5. **Access Control at the URL Level** — Public files served via CDN with long cache TTLs. Private files accessed only via time-limited presigned URLs. Never expose raw bucket URLs.

## Patterns

### Pattern 1: Presigned Upload Flow

```typescript
// Server: Generate presigned upload URL
app.post('/api/v1/uploads/presign', async (c) => {
  const { filename, contentType, size } = await c.req.json();

  assert(size <= 50 * 1024 * 1024, 'File exceeds 50MB limit');
  assert(ALLOWED_TYPES.includes(contentType), `Unsupported content type: ${contentType}`);

  const key = `uploads/${tenantId}/${crypto.randomUUID()}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.UPLOAD_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
    Metadata: {
      'tenant-id': tenantId,
      'uploaded-by': userId,
    },
  });

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

  // Track upload in database
  const upload = await db.fileUpload.create({
    data: { key, filename, contentType, size, tenantId, status: 'pending' },
  });

  return c.json({ uploadUrl: presignedUrl, uploadId: upload.id, key });
});

// Client: Direct upload to S3/R2
async function uploadFile(file: File): Promise<string> {
  const { uploadUrl, uploadId } = await api.post('/uploads/presign', {
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });

  await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });

  await api.post(`/uploads/${uploadId}/complete`);
  return uploadId;
}
```

### Pattern 2: Multipart Upload for Large Files

```typescript
async function initiateMultipartUpload(key: string, contentType: string) {
  const { UploadId } = await s3Client.send(new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  }));

  // Generate presigned URLs for each part (5MB chunks)
  const partSize = 5 * 1024 * 1024;
  const parts: { partNumber: number; url: string }[] = [];

  for (let i = 1; i <= Math.ceil(fileSize / partSize); i++) {
    const url = await getSignedUrl(s3Client, new UploadPartCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId,
      PartNumber: i,
    }), { expiresIn: 3600 });
    parts.push({ partNumber: i, url });
  }

  return { uploadId: UploadId, parts };
}
```

### Pattern 3: Image Processing Pipeline

```typescript
// Cloudflare Worker for on-the-fly image transformation
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const width = parseInt(url.searchParams.get('w') ?? '0');
    const format = url.searchParams.get('f') ?? 'webp';

    const imageUrl = `${env.R2_PUBLIC_URL}${url.pathname}`;

    return fetch(imageUrl, {
      cf: {
        image: {
          width: Math.min(width, 2048),
          format: format as 'webp' | 'avif' | 'jpeg',
          quality: 80,
          fit: 'contain',
        },
      },
    });
  },
};
```

### Pattern 4: Virus Scanning with Quarantine

```typescript
async function processUpload(uploadId: string): Promise<void> {
  const upload = await db.fileUpload.findUniqueOrThrow({ where: { id: uploadId } });

  // Download to temp for scanning
  const tempPath = `/tmp/${upload.id}`;
  const obj = await s3Client.send(new GetObjectCommand({ Bucket: QUARANTINE_BUCKET, Key: upload.key }));
  await writeFile(tempPath, obj.Body);

  const scanResult = await clamav.scanFile(tempPath);
  await unlink(tempPath);

  if (scanResult.isInfected) {
    await db.fileUpload.update({ where: { id: uploadId }, data: { status: 'rejected', scanResult: 'infected' } });
    await s3Client.send(new DeleteObjectCommand({ Bucket: QUARANTINE_BUCKET, Key: upload.key }));
    return;
  }

  // Move from quarantine to production bucket
  await s3Client.send(new CopyObjectCommand({
    Bucket: PRODUCTION_BUCKET,
    CopySource: `${QUARANTINE_BUCKET}/${upload.key}`,
    Key: upload.key,
  }));
  await s3Client.send(new DeleteObjectCommand({ Bucket: QUARANTINE_BUCKET, Key: upload.key }));
  await db.fileUpload.update({ where: { id: uploadId }, data: { status: 'approved', scanResult: 'clean' } });
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Uploading through API server | Memory pressure, bandwidth bottleneck, timeouts | Presigned URLs for direct client-to-storage upload |
| Storing files in database BLOB columns | Database bloat, backup size, memory issues | Object storage with metadata in database |
| Public bucket URLs without CDN | No caching, no access control, reveals infrastructure | CDN with signed URLs or access tokens |
| No file type validation | Executable uploads, XSS via SVG, path traversal | Validate content type, scan content, sanitize names |
| Overwriting existing files | No audit trail, cache invalidation issues | Immutable objects with versioned keys |
| No size limits | Storage cost explosion, DoS vector | Enforce max file size at presign and upload |

## Implementation Checklist

- [ ] Set up presigned URL generation for all file uploads
- [ ] Implement multipart upload for files >10MB
- [ ] Configure quarantine bucket with virus scanning pipeline
- [ ] Set up CDN (CloudFront/Cloudflare) for file serving
- [ ] Implement content type validation and file size limits
- [ ] Add image processing pipeline for on-demand resizing
- [ ] Configure lifecycle rules for temp file cleanup
- [ ] Set up access logging and cost monitoring for storage

## References

- [AWS S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Cloudflare Image Transformations](https://developers.cloudflare.com/images/transform-images/)
- [ClamAV Documentation](https://docs.clamav.net/)
