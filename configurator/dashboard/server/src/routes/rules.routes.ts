// SPDX-License-Identifier: MIT
/**
 * Rules API Routes
 *
 * GET /api/rules  — list available project rule templates
 */

import { Router, type Request, type Response } from 'express';
import { RulesService } from '../services/rules.service.js';

export const rulesRoutes = Router();
const service = new RulesService();

rulesRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const rules = await service.getRules();
    res.json({ success: true, data: rules });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to load rules' });
  }
});
