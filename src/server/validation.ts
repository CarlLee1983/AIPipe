import { z } from "zod";

export const CreateRunSchema = z.object({
  workflow: z.string().min(1, "workflow 名稱不得為空"),
  inputs: z.record(z.string()).default({}),
  source: z.string().default("api"),
});

export type CreateRunInput = z.infer<typeof CreateRunSchema>;

export const ResumeRunSchema = z.object({
  approve: z.boolean({ required_error: "approve 必填" }),
  note: z.string().optional(),
});

export type ResumeRunInput = z.infer<typeof ResumeRunSchema>;

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function validateBody<T>(schema: z.ZodType<T>, raw: unknown): ValidationResult<T> {
  const res = schema.safeParse(raw);
  if (res.success) {
    return { success: true, data: res.data };
  }
  const issues = res.error.issues
    .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
    .join("; ");
  return { success: false, error: issues };
}
