// SPDX-License-Identifier: MIT
/**
 * Code Generator API Routes
 *
 * REST endpoints for spec validation, code generation, and refinement.
 *
 * SECURITY:
 * - File uploads limited to 5MB
 * - Multer memory storage prevents path traversal
 * - Rate limiting on upload/generate endpoints
 * - Path validation on all write operations
 */

import path from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer, { type FileFilterCallback, MulterError } from 'multer';
import rateLimit from 'express-rate-limit';
import { CodeGenService } from '../services/codegen.service.js';
import { getLogger } from '../utils/logger.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import { validateBody } from '../middleware/validateRequest.js';
import {
  CodeGenValidateRequestSchema,
  CodeGenPreviewRequestSchema,
  CodeGenGenerateRequestSchema,
  CodeGenRefineRequestSchema,
  CodeGenAcceptRequestSchema,
  CodeGenConventionsRequestSchema,
} from '../validation/schemas.js';

const logger = getLogger('codegen-routes');
export const codegenRoutes = Router();
const codegenService = new CodeGenService();

// Rate limiting for code generation (5 per minute)
const generateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many generation requests, please try again later' },
});

// Multer for spec file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    const allowedExtensions = ['.yaml', '.yml', '.json', '.tsp', '.proto', '.bpmn', '.xml'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Allowed: ${allowedExtensions.join(', ')}`));
    }
  },
});

/**
 * Multer error handler
 */
function handleMulterError(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        res.status(413).json({ success: false, error: 'File too large. Maximum size is 5MB.' });
        return;
      case 'LIMIT_FILE_COUNT':
        res.status(400).json({ success: false, error: 'Only one file allowed per upload.' });
        return;
      default:
        res.status(400).json({ success: false, error: 'File upload error.' });
        return;
    }
  }

  if (err.message.startsWith('Unsupported file type')) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  next(err);
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/codegen/targets
 * Get available target languages for a technology
 */
codegenRoutes.get('/codegen/targets', (req: Request, res: Response) => {
  try {
    const technology = req.query.technology as string | undefined;
    const targets = codegenService.getTargets(
      technology as Parameters<typeof codegenService.getTargets>[0]
    );
    return res.json({ success: true, data: targets });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get targets',
    });
  }
});

/**
 * POST /api/codegen/upload
 * Upload and validate a spec file
 */
codegenRoutes.post(
  '/codegen/upload',
  generateRateLimiter,
  upload.single('file'),
  handleMulterError,
  (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const content = file.buffer.toString('utf-8');
      const fileName = file.originalname;
      const technology = req.body?.technology as string | undefined;

      const validation = codegenService.validateSpec(
        content,
        fileName,
        technology as Parameters<typeof codegenService.validateSpec>[2]
      );

      return res.json({
        success: true,
        data: {
          validation,
          content,
          fileName,
        },
      });
    } catch (err) {
      logger.error('Upload validation failed', { error: err instanceof Error ? err.message : 'unknown' });
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  }
);

/**
 * POST /api/codegen/validate
 * Validate spec content (without file upload)
 */
codegenRoutes.post(
  '/codegen/validate',
  validateBody(CodeGenValidateRequestSchema),
  (req: Request, res: Response) => {
    try {
      const { content, fileName, technology } = req.body;
      const validation = codegenService.validateSpec(content, fileName, technology);
      return res.json({ success: true, data: validation });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Validation failed',
      });
    }
  }
);

/**
 * POST /api/codegen/preview
 * Preview files that would be generated
 */
codegenRoutes.post(
  '/codegen/preview',
  validateBody(CodeGenPreviewRequestSchema),
  (req: Request, res: Response) => {
    try {
      const { content, fileName, technology, targetLanguage, components } = req.body;
      const preview = codegenService.generatePreview(content, fileName, technology, targetLanguage, components);
      return res.json({ success: true, data: preview });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Preview failed',
      });
    }
  }
);

/**
 * POST /api/codegen/generate
 * Generate code from spec
 */
codegenRoutes.post(
  '/codegen/generate',
  generateRateLimiter,
  validateBody(CodeGenGenerateRequestSchema),
  (req: Request, res: Response) => {
    try {
      const { projectPath, content, fileName, technology, targetLanguage, outputDir, components } = req.body;

      const resolvedPath = resolveProjectPath(projectPath);
      if (!path.isAbsolute(resolvedPath)) {
        throw new PathValidationError('Path must be rooted');
      }

      const generatedFiles = codegenService.generate(
        content, fileName, technology, targetLanguage, outputDir, components, projectPath
      );

      return res.json({
        success: true,
        data: {
          files: generatedFiles,
          totalFiles: generatedFiles.length,
          totalSize: generatedFiles.reduce((sum, f) => sum + f.size, 0),
        },
      });
    } catch (err) {
      logger.error('Code generation failed', { error: err instanceof Error ? err.message : 'unknown' });
      if (err instanceof PathValidationError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Generation failed',
      });
    }
  }
);

/**
 * POST /api/codegen/conventions
 * Scan project for coding conventions
 */
codegenRoutes.post(
  '/codegen/conventions',
  validateBody(CodeGenConventionsRequestSchema),
  (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;

      const resolvedPath = resolveProjectPath(projectPath);
      if (!path.isAbsolute(resolvedPath)) {
        throw new PathValidationError('Path must be rooted');
      }

      const conventions = codegenService.scanConventions(projectPath);
      return res.json({ success: true, data: conventions });
    } catch (err) {
      if (err instanceof PathValidationError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Convention scan failed',
      });
    }
  }
);

/**
 * POST /api/codegen/refine
 * Build refinement job for orchestrator
 */
codegenRoutes.post(
  '/codegen/refine',
  validateBody(CodeGenRefineRequestSchema),
  (req: Request, res: Response) => {
    try {
      const { projectPath, generatedFiles, technology, targetLanguage, refinementOptions } = req.body;

      const resolvedPath = resolveProjectPath(projectPath);
      if (!path.isAbsolute(resolvedPath)) {
        throw new PathValidationError('Path must be rooted');
      }

      // Scan conventions first
      const conventions = codegenService.scanConventions(projectPath);

      // Build the job
      const job = codegenService.buildRefinementJob(
        projectPath, generatedFiles, technology, targetLanguage, refinementOptions, conventions
      );

      return res.json({ success: true, data: job });
    } catch (err) {
      if (err instanceof PathValidationError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Refinement job creation failed',
      });
    }
  }
);

/**
 * POST /api/codegen/accept
 * Accept and write generated files to disk
 */
codegenRoutes.post(
  '/codegen/accept',
  validateBody(CodeGenAcceptRequestSchema),
  (req: Request, res: Response) => {
    try {
      const { projectPath, files, outputDir } = req.body;

      const resolvedPath = resolveProjectPath(projectPath);
      if (!path.isAbsolute(resolvedPath)) {
        throw new PathValidationError('Path must be rooted');
      }

      const result = codegenService.acceptFiles(projectPath, outputDir, files);
      return res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof PathValidationError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'File acceptance failed',
      });
    }
  }
);
