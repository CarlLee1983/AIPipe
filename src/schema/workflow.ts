import { z } from "zod";

export const InputDefSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().default(false),
  default: z.string().optional(),
});

export const AgentSpecSchema = z.object({
  prompt: z.string().min(1),
  allowedTools: z.array(z.string()).optional(),
  model: z.string().optional(),
  cwd: z.string().optional(),
});

export const CheckpointSchema = z.object({
  prompt: z.string().min(1),
});

export const StageSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  agent: AgentSpecSchema,
  output: z.string().optional(),
  checkpoint: CheckpointSchema.optional(),
});

export const WorkflowSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "name 必須為 kebab-case"),
  description: z.string().optional(),
  inputs: z.array(InputDefSchema).default([]),
  stages: z.array(StageSchema).min(1, "至少需要一個 stage"),
});

export type InputDef = z.infer<typeof InputDefSchema>;
export type AgentSpec = z.infer<typeof AgentSpecSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
