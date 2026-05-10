import { z } from "zod";

export const binderEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  note: z.string(),
});

export const bindersFileSchema = z.object({
  binders: z.array(binderEntrySchema),
});

export type BinderEntry = z.infer<typeof binderEntrySchema>;
/** @deprecated use binderEntrySchema */
export const binderSchema = binderEntrySchema;
export type Binder = BinderEntry;
export type BindersFile = z.infer<typeof bindersFileSchema>;

export const binderSlotSchema = z.object({
  binder: z.string().min(1),
  nonfoil: z.number().int().min(0),
  foil: z.number().int().min(0),
});

export const printRowSchema = z.object({
  id: z.string().uuid(),
  set: z.string().min(1),
  collector_number: z.string(),
  name: z.string(),
  storage: z.object({
    nonfoil: z.number().int().min(0),
    foil: z.number().int().min(0),
  }),
  binders: z.array(binderSlotSchema),
  note: z.string(),
});

export type PrintRow = z.infer<typeof printRowSchema>;
export type BinderSlot = z.infer<typeof binderSlotSchema>;

export const printsFileSchema = z.object({
  schemaVersion: z.number().int().optional(),
  prints: z.array(printRowSchema),
});

export type PrintsFile = z.infer<typeof printsFileSchema>;

export const appConfigSchema = z.object({
  defaultSearchQuery: z.string(),
  slowLaneMinIntervalMs: z.number().positive().optional(),
  fastLaneMinIntervalMs: z.number().positive().optional(),
  /** Min delay between SVG/CDN fetches during sync (set icons, card symbols). */
  assetLaneMinIntervalMs: z.number().positive().optional(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const syncStateSchema = z.object({
  lastSyncStartedAt: z.string().optional(),
  lastSyncCompletedAt: z.string().optional(),
  cardCount: z.number().int().nonnegative().optional(),
  setCount: z.number().int().nonnegative().optional(),
  errors: z
    .array(
      z.object({
        at: z.string(),
        message: z.string(),
        detail: z.string().optional(),
      }),
    )
    .optional(),
});

export type SyncState = z.infer<typeof syncStateSchema>;

export const catalogCardSchema = z
  .object({
    catalogVersion: z.literal(1),
    id: z.string().uuid(),
    name: z.string(),
    set: z.string(),
    set_name: z.string().optional(),
    collector_number: z.string(),
    rarity: z.string().optional(),
    type_line: z.string().optional(),
    image_uris: z.record(z.string(), z.string()).optional(),
    card_faces: z
      .array(
        z.object({
          name: z.string().optional(),
          image_uris: z.record(z.string(), z.string()).optional(),
        }),
      )
      .optional(),
    prices: z.record(z.string(), z.string().nullable()).optional(),
    /** Cardmarket (MKM) product id for linking to cardmarket.com Products page. */
    cardmarket_id: z.number().int().positive().optional(),
    foil: z.boolean().optional(),
    nonfoil: z.boolean().optional(),
    scryfall_uri: z.string().optional(),
    uri: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export type CatalogCard = z.infer<typeof catalogCardSchema>;
