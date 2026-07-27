import { z } from 'zod';

export const StorySchema = z.object({
  id: z.string().min(1, 'ID is required'),
  title: z.string().min(1, 'Title is required'),
  author: z.string().min(1, 'Author is required'),
}).strict();

export const ChapterSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  title: z.string().min(1, 'Title is required'),
  consent_status: z.enum(['VERIFIED', 'FLAG', 'UNKNOWN']),
}).strict();

export const CanvasNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
}).strict();

export const CanvasEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
}).strict();

export const CanvasGraphSchema = z.object({
  nodes: z.array(CanvasNodeSchema),
  edges: z.array(CanvasEdgeSchema),
}).strict();

export const MergeRequestSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1, 'At least one source ID required'),
  targetId: z.string().min(1, 'Target ID is required'),
}).strict();

export const SuccessResponseSchema = z.object({
  success: z.boolean(),
}).strict();

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.record(z.unknown()).optional(),
}).strict();

export const HealthMetricsSchema = z.object({
  status: z.string(),
  error_rate: z.number(),
}).strict();

export type Story = z.infer<typeof StorySchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type CanvasGraph = z.infer<typeof CanvasGraphSchema>;
export type MergeRequest = z.infer<typeof MergeRequestSchema>;
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type HealthMetrics = z.infer<typeof HealthMetricsSchema>;
