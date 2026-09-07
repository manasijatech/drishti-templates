import { z } from "zod";

export const ORDER_WIN_CATEGORY = "Award/Receipt of Order" as const;

export const jsonValueSchema: z.ZodType<
  string | number | boolean | null | { readonly [key: string]: unknown } | readonly unknown[]
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export type JsonValue = z.infer<typeof jsonValueSchema>;

const sourceDateSchema = z.iso.datetime({ offset: true, local: true });

export const drishtiAnnouncementSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().trim().min(1),
  company_name: z.string().nullable().optional(),
  image: z.url().nullable().optional(),
  date: sourceDateSchema.nullable().optional(),
  summary: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  long_summary: z.string().nullable().optional(),
  related_categories: z.array(z.string()).optional(),
  important: z.boolean().optional(),
  extracted_information: jsonValueSchema.optional(),
});

export const drishtiAnnouncementPageSchema = z.object({
  data: z.array(drishtiAnnouncementSchema),
  has_next: z.boolean(),
});

export type DrishtiAnnouncement = z.infer<typeof drishtiAnnouncementSchema>;

export const orderWinSchema = z.object({
  id: z.string().min(1),
  source: z.literal("drishti"),
  sourceAnnouncementId: z.string().min(1),
  symbol: z.string().min(1),
  companyName: z.string().nullable(),
  announcedAt: z.date().nullable(),
  category: z.literal(ORDER_WIN_CATEGORY),
  summary: z.string().nullable(),
  longSummary: z.string().nullable(),
  relatedCategories: z.array(z.string()),
  important: z.boolean().nullable(),
  extractedInformation: jsonValueSchema.nullable(),
  sourceImageUrl: z.url().nullable(),
  contentHash: z.string().min(1),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
  schemaVersion: z.literal(1),
});

export type OrderWin = z.infer<typeof orderWinSchema>;
export type OrderWinCandidate = Omit<OrderWin, "id" | "firstSeenAt" | "lastSeenAt">;

export const ingestionRunStatusSchema = z.enum([
  "running",
  "succeeded",
  "partially_succeeded",
  "failed",
]);

export const ingestionRunSchema = z.object({
  id: z.string().min(1),
  status: ingestionRunStatusSchema,
  trigger: z.enum(["manual", "scheduled"]),
  window: z.object({ from: z.date(), to: z.date() }),
  pagesFetched: z.number().int().nonnegative(),
  recordsFetched: z.number().int().nonnegative(),
  recordsInserted: z.number().int().nonnegative(),
  recordsUpdated: z.number().int().nonnegative(),
  recordsUnchanged: z.number().int().nonnegative(),
  recordsRejected: z.number().int().nonnegative(),
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

export type IngestionRun = z.infer<typeof ingestionRunSchema>;

export const createIngestionSchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export type CreateIngestionInput = z.infer<typeof createIngestionSchema>;

export const listOrderWinsQuerySchema = z.object({
  symbol: z.string().trim().min(1).optional(),
  cursor: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid cursor")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListOrderWinsQuery = z.infer<typeof listOrderWinsQuerySchema>;

export function toOrderWinDto(orderWin: OrderWin) {
  return {
    ...orderWin,
    announcedAt: orderWin.announcedAt?.toISOString() ?? null,
    firstSeenAt: orderWin.firstSeenAt.toISOString(),
    lastSeenAt: orderWin.lastSeenAt.toISOString(),
  };
}

export function toIngestionRunDto(run: IngestionRun) {
  return {
    ...run,
    window: { from: run.window.from.toISOString(), to: run.window.to.toISOString() },
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}
