import path from 'node:path';
// SPDX-License-Identifier: MIT
/**
 * Custom Agents API Routes
 *
 * REST endpoints for managing project-specific custom agents.
 *
 * SECURITY:
 * - File uploads limited to 1MB .md files only
 * - Multer error handling prevents information leakage
 * - Rate limiting on upload endpoints (10 uploads/minute)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer, { type FileFilterCallback, MulterError } from 'multer';
import rateLimit from 'express-rate-limit';
import { CustomAgentsService } from '../services/custom-agents.service.js';
import { getLogger } from '../utils/logger.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import {
  ListCustomAgentsRequestSchema,
  GetCustomAgentRequestSchema,
  CreateCustomAgentUploadRequestSchema,
  CreateCustomAgentGenerateRequestSchema,
  UpdateCustomAgentRequestSchema,
  DeleteCustomAgentRequestSchema,
  ValidateCustomAgentRequestSchema,
  ListCustomSkillsRequestSchema,
  GetCustomSkillRequestSchema,
  CreateCustomSkillRequestSchema,
  UpdateCustomSkillRequestSchema,
  ValidateCustomSkillRequestSchema,
  DeleteCustomSkillRequestSchema,
} from '../validation/schemas.js';

const logger = getLogger('custom-agents-routes');
const router = Router();
const customAgentsService = new CustomAgentsService();

// SECURITY: Stricter rate limit for file uploads (10 per minute)
const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { success: false, error: 'Too many uploads, please try again later' },
});

// Configure multer for file uploads with security constraints
const upload = multer({
  storage: multer.memoryStorage(), // Memory storage prevents path traversal
  limits: {
    fileSize: 1024 * 1024, // 1MB max - prevents DoS via large files
    files: 1, // Only one file at a time
  },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    // SECURITY: Strict file type validation
    const isMarkdown = file.mimetype === 'text/markdown' ||
                       file.mimetype === 'text/plain' ||
                       file.originalname.toLowerCase().endsWith('.md');
    if (isMarkdown) {
      cb(null, true);
    } else {
      cb(new Error('Only markdown (.md) files are allowed'));
    }
  },
});

/**
 * Multer error handler middleware
 * SECURITY: Prevents information leakage from multer errors
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
        res.status(413).json({
          success: false,
          error: 'File too large. Maximum size is 1MB.',
        });
        return;
      case 'LIMIT_FILE_COUNT':
        res.status(400).json({
          success: false,
          error: 'Too many files. Only one file allowed per upload.',
        });
        return;
      case 'LIMIT_UNEXPECTED_FILE':
        res.status(400).json({
          success: false,
          error: 'Unexpected file field.',
        });
        return;
      default:
        res.status(400).json({
          success: false,
          error: 'File upload error.',
        });
        return;
    }
  }

  if (err.message === 'Only markdown (.md) files are allowed') {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  next(err);
}

// ============================================
// CUSTOM AGENTS ENDPOINTS
// ============================================

/**
 * GET /api/custom-agents
 * List all custom agents for a project
 */
router.get('/custom-agents', async (req: Request, res: Response) => {
  try {
    const parseResult = ListCustomAgentsRequestSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { path: projectPath } = parseResult.data;
    const agents = await customAgentsService.getCustomAgents(projectPath);

    res.json({
      success: true,
      data: {
        agents,
        total: agents.length,
      },
    });
  } catch (error) {
    logger.error('Failed to list custom agents', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to list custom agents',
    });
  }
});

/**
 * GET /api/custom-agents/:id
 * Get a single custom agent with full content
 */
router.get('/custom-agents/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = GetCustomAgentRequestSchema.safeParse({
      path: req.query.path,
      id: req.params.id,
    });

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { path: projectPath, id } = parseResult.data;
    const agent = await customAgentsService.getCustomAgent(projectPath, id);

    if (!agent) {
      res.status(404).json({
        success: false,
        error: `Agent '${id}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: { agent },
    });
  } catch (error) {
    logger.error('Failed to get custom agent', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get custom agent',
    });
  }
});

/**
 * POST /api/custom-agents
 * Create a new custom agent via upload or content
 */
router.post('/custom-agents', async (req: Request, res: Response) => {
  try {
    const parseResult = CreateCustomAgentUploadRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { projectPath, content, bypassWarnings } = parseResult.data;
    const result = await customAgentsService.createCustomAgent(projectPath, content, bypassWarnings);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
        validation: result.validation,
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        agent: result.agent,
        validation: result.validation,
      },
    });
  } catch (error) {
    logger.error('Failed to create custom agent', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create custom agent',
    });
  }
});

// Extend Request type to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * POST /api/custom-agents/upload
 * Create a custom agent by uploading a .md file
 * SECURITY: Rate limited (10/min), file size limited (1MB), .md only
 */
router.post(
  '/custom-agents/upload',
  uploadRateLimiter,
  upload.single('file'),
  handleMulterError,
  async (req: MulterRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    const projectPath = resolveProjectPath(req.body.projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const bypassWarnings = req.body.bypassWarnings === 'true';

    const content = req.file.buffer.toString('utf-8');
    const result = await customAgentsService.createCustomAgent(projectPath, content, bypassWarnings);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
        validation: result.validation,
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        agent: result.agent,
        validation: result.validation,
      },
    });
  } catch (error) {
    logger.error('Failed to upload custom agent', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to upload custom agent',
    });
  }
});

/**
 * POST /api/custom-agents/generate
 * Start AI generation of a custom agent (returns job ID)
 */
router.post('/custom-agents/generate', async (req: Request, res: Response) => {
  try {
    const parseResult = CreateCustomAgentGenerateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    // AI generation will be handled via WebSocket/orchestrator
    // This endpoint returns the configuration for the job
    const { projectPath, name, description, techFocus, skills, mcpServers, model } = parseResult.data;

    res.json({
      success: true,
      data: {
        message: 'Submit this configuration as an orchestrator job to generate the agent',
        jobConfig: {
          type: 'generate-custom-agent',
          projectPath,
          name,
          description,
          techFocus,
          skills,
          mcpServers,
          model,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to prepare agent generation', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to prepare agent generation',
    });
  }
});

/**
 * PUT /api/custom-agents/:id
 * Update an existing custom agent
 */
router.put('/custom-agents/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = UpdateCustomAgentRequestSchema.safeParse({
      ...req.body,
      agentId: req.params.id,
    });

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { projectPath, agentId, content, bypassWarnings } = parseResult.data;
    const result = await customAgentsService.updateCustomAgent(projectPath, agentId, content, bypassWarnings);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
        validation: result.validation,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        agent: result.agent,
        validation: result.validation,
      },
    });
  } catch (error) {
    logger.error('Failed to update custom agent', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update custom agent',
    });
  }
});

/**
 * DELETE /api/custom-agents/:id
 * Delete a custom agent
 */
router.delete('/custom-agents/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = DeleteCustomAgentRequestSchema.safeParse({
      projectPath: req.query.projectPath || req.body.projectPath,
      agentId: req.params.id,
    });

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { projectPath, agentId } = parseResult.data;
    const result = await customAgentsService.deleteCustomAgent(projectPath, agentId);

    if (!result.success) {
      res.status(404).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.json({
      success: true,
      data: { deleted: agentId },
    });
  } catch (error) {
    logger.error('Failed to delete custom agent', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete custom agent',
    });
  }
});

/**
 * POST /api/custom-agents/validate
 * Validate custom agent content without saving
 */
router.post('/custom-agents/validate', async (req: Request, res: Response) => {
  try {
    const parseResult = ValidateCustomAgentRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { content } = parseResult.data;
    const validation = customAgentsService.validateAgentContent(content);

    res.json({
      success: true,
      data: { validation },
    });
  } catch (error) {
    logger.error('Failed to validate custom agent', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to validate custom agent',
    });
  }
});

// ============================================
// CUSTOM SKILLS ENDPOINTS
// ============================================

/**
 * GET /api/custom-skills
 * List all custom skills for a project
 */
router.get('/custom-skills', async (req: Request, res: Response) => {
  try {
    const parseResult = ListCustomSkillsRequestSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { path: projectPath } = parseResult.data;
    const skills = await customAgentsService.getCustomSkills(projectPath);

    res.json({
      success: true,
      data: {
        skills,
        total: skills.length,
      },
    });
  } catch (error) {
    logger.error('Failed to list custom skills', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to list custom skills',
    });
  }
});

/**
 * GET /api/custom-skills/:id
 * Get a single custom skill with full content
 */
router.get('/custom-skills/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = GetCustomSkillRequestSchema.safeParse({
      path: req.query.path,
      id: req.params.id,
    });

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { path: projectPath, id } = parseResult.data;
    const skill = await customAgentsService.getCustomSkill(projectPath, id);

    if (!skill) {
      res.status(404).json({
        success: false,
        error: `Skill '${id}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: { skill },
    });
  } catch (error) {
    logger.error('Failed to get custom skill', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get custom skill',
    });
  }
});

/**
 * POST /api/custom-skills
 * Create a new custom skill
 */
router.post('/custom-skills', async (req: Request, res: Response) => {
  try {
    const parseResult = CreateCustomSkillRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { projectPath, name, content, bypassWarnings } = parseResult.data;
    const result = await customAgentsService.createCustomSkill(projectPath, name, content, bypassWarnings);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
        validation: result.validation,
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: { skill: result.skill, validation: result.validation },
    });
  } catch (error) {
    logger.error('Failed to create custom skill', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create custom skill',
    });
  }
});

/**
 * POST /api/custom-skills/upload
 * Create a custom skill by uploading a .md file
 * SECURITY: Rate limited (10/min), file size limited (1MB), .md only
 */
router.post(
  '/custom-skills/upload',
  uploadRateLimiter,
  upload.single('file'),
  handleMulterError,
  async (req: MulterRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    const projectPath = resolveProjectPath(req.body.projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const name = req.body.name;
    if (!name || typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      res.status(400).json({
        success: false,
        error: 'Skill name is required and must be kebab-case (lowercase letters, numbers, hyphens)',
      });
      return;
    }
    const bypassWarnings = req.body.bypassWarnings === 'true';

    const content = req.file.buffer.toString('utf-8');
    const result = await customAgentsService.createCustomSkill(projectPath, name, content, bypassWarnings);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
        validation: result.validation,
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: { skill: result.skill, validation: result.validation },
    });
  } catch (error) {
    logger.error('Failed to upload custom skill', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to upload custom skill',
    });
  }
});

/**
 * POST /api/custom-skills/validate
 * Validate custom skill content without saving
 */
router.post('/custom-skills/validate', async (req: Request, res: Response) => {
  try {
    const parseResult = ValidateCustomSkillRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { content } = parseResult.data;
    const validation = customAgentsService.validateSkillContent(content);

    res.json({
      success: true,
      data: { validation },
    });
  } catch (error) {
    logger.error('Failed to validate custom skill', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to validate custom skill',
    });
  }
});

/**
 * PUT /api/custom-skills/:id
 * Update an existing custom skill
 */
router.put('/custom-skills/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = UpdateCustomSkillRequestSchema.safeParse({
      ...req.body,
      skillId: req.params.id,
    });

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { projectPath, skillId, name, content, bypassWarnings } = parseResult.data;
    const result = await customAgentsService.updateCustomSkill(projectPath, skillId, name, content, bypassWarnings);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
        validation: result.validation,
      });
      return;
    }

    res.json({
      success: true,
      data: { skill: result.skill, validation: result.validation },
    });
  } catch (error) {
    logger.error('Failed to update custom skill', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update custom skill',
    });
  }
});

/**
 * DELETE /api/custom-skills/:id
 * Delete a custom skill
 */
router.delete('/custom-skills/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = DeleteCustomSkillRequestSchema.safeParse({
      projectPath: req.query.projectPath || req.body.projectPath,
      skillId: req.params.id,
    });

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
      });
      return;
    }

    const { projectPath, skillId } = parseResult.data;
    const result = await customAgentsService.deleteCustomSkill(projectPath, skillId);

    if (!result.success) {
      res.status(404).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.json({
      success: true,
      data: { deleted: skillId },
    });
  } catch (error) {
    logger.error('Failed to delete custom skill', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete custom skill',
    });
  }
});

export { router as customAgentsRoutes };
