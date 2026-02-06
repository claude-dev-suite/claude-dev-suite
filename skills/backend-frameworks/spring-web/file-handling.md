# File Upload & Download

## File Upload

### Single & Multiple File Upload

```java
@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService storageService;

    // Single file upload
    @PostMapping("/upload")
    public ResponseEntity<FileResponse> uploadFile(
            @RequestParam("file") MultipartFile file) {

        String fileName = storageService.store(file);

        return ResponseEntity.ok(FileResponse.builder()
            .fileName(fileName)
            .size(file.getSize())
            .contentType(file.getContentType())
            .build());
    }

    // Multiple files upload
    @PostMapping("/upload-multiple")
    public ResponseEntity<List<FileResponse>> uploadMultipleFiles(
            @RequestParam("files") List<MultipartFile> files) {

        List<FileResponse> responses = files.stream()
            .map(file -> {
                String fileName = storageService.store(file);
                return FileResponse.builder()
                    .fileName(fileName)
                    .size(file.getSize())
                    .contentType(file.getContentType())
                    .build();
            })
            .toList();

        return ResponseEntity.ok(responses);
    }

    // Upload with metadata
    @PostMapping(value = "/upload-with-metadata", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileResponse> uploadWithMetadata(
            @RequestPart("file") MultipartFile file,
            @RequestPart("metadata") @Valid FileMetadata metadata) {

        String fileName = storageService.store(file, metadata);
        return ResponseEntity.ok(FileResponse.builder()
            .fileName(fileName)
            .description(metadata.getDescription())
            .build());
    }
}
```

### Upload Configuration

```java
@Configuration
public class FileUploadConfig {

    @Bean
    public MultipartConfigElement multipartConfigElement() {
        MultipartConfigFactory factory = new MultipartConfigFactory();
        factory.setMaxFileSize(DataSize.ofMegabytes(10));
        factory.setMaxRequestSize(DataSize.ofMegabytes(50));
        return factory.createMultipartConfig();
    }
}
```

```yaml
# application.yml
spring:
  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 50MB
```

---

## File Download

```java
@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileDownloadController {

    private final FileStorageService storageService;

    // Download file as Resource
    @GetMapping("/download/{fileName}")
    public ResponseEntity<Resource> downloadFile(@PathVariable String fileName) {
        Resource resource = storageService.loadAsResource(fileName);
        String contentType = storageService.getContentType(fileName);

        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(contentType))
            .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + resource.getFilename() + "\"")
            .body(resource);
    }

    // Download with InputStreamResource
    @GetMapping("/download-stream/{fileName}")
    public ResponseEntity<InputStreamResource> downloadStream(@PathVariable String fileName) {
        InputStream inputStream = storageService.getInputStream(fileName);
        long contentLength = storageService.getFileSize(fileName);

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .contentLength(contentLength)
            .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + fileName + "\"")
            .body(new InputStreamResource(inputStream));
    }

    // Streaming download for large files
    @GetMapping("/stream/{fileName}")
    public void streamFile(
            @PathVariable String fileName,
            HttpServletResponse response) throws IOException {

        response.setContentType(MediaType.APPLICATION_OCTET_STREAM_VALUE);
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
            "attachment; filename=\"" + fileName + "\"");

        try (InputStream inputStream = storageService.getInputStream(fileName);
             OutputStream outputStream = response.getOutputStream()) {

            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
            }
            outputStream.flush();
        }
    }
}
```

---

## File Storage Service

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class FileStorageService {

    @Value("${file.upload-dir}")
    private String uploadDir;

    public String store(MultipartFile file) {
        try {
            String fileName = UUID.randomUUID() + "_" +
                StringUtils.cleanPath(file.getOriginalFilename());

            Path targetLocation = Paths.get(uploadDir).resolve(fileName);
            Files.copy(file.getInputStream(), targetLocation,
                StandardCopyOption.REPLACE_EXISTING);

            return fileName;
        } catch (IOException e) {
            throw new FileStorageException("Failed to store file", e);
        }
    }

    public Resource loadAsResource(String fileName) {
        try {
            Path filePath = Paths.get(uploadDir).resolve(fileName).normalize();
            Resource resource = new UrlResource(filePath.toUri());

            if (resource.exists()) {
                return resource;
            }
            throw new FileNotFoundException("File not found: " + fileName);
        } catch (MalformedURLException e) {
            throw new FileNotFoundException("File not found: " + fileName);
        }
    }

    public InputStream getInputStream(String fileName) {
        try {
            Path filePath = Paths.get(uploadDir).resolve(fileName);
            return Files.newInputStream(filePath);
        } catch (IOException e) {
            throw new FileNotFoundException("File not found: " + fileName);
        }
    }

    public long getFileSize(String fileName) {
        try {
            Path filePath = Paths.get(uploadDir).resolve(fileName);
            return Files.size(filePath);
        } catch (IOException e) {
            throw new FileNotFoundException("File not found: " + fileName);
        }
    }

    public String getContentType(String fileName) {
        try {
            Path filePath = Paths.get(uploadDir).resolve(fileName);
            String contentType = Files.probeContentType(filePath);
            return contentType != null ? contentType : "application/octet-stream";
        } catch (IOException e) {
            return "application/octet-stream";
        }
    }

    public void delete(String fileName) {
        try {
            Path filePath = Paths.get(uploadDir).resolve(fileName);
            Files.deleteIfExists(filePath);
        } catch (IOException e) {
            log.warn("Failed to delete file: {}", fileName, e);
        }
    }
}
```
