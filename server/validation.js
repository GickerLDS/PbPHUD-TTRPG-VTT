import { z } from 'zod';

const mapName = z.string().trim().min(1).max(120).regex(/^[\w -]+$/);
const groupName = z.string().trim().min(1).max(80).regex(/^[\w-]+$/);
const gridSize = z.number().int().min(5).max(80);
const gridDimension = z.number().int().min(5).max(99);
const tileCode = z.string().trim().regex(/^[A-Za-z0-9#]{6}$/);
const layer = z.string().trim().min(1).max(1).regex(/^[A-Za-z0-9]$/);
const largeString = z.string().max(10_000_000);
const point = z.object({
  x: z.number(),
  y: z.number()
});

const backgroundImage = z.object({
  src: largeString.default(''),
  width: z.number().int().min(1).max(20000).default(1000),
  height: z.number().int().min(1).max(20000).default(1000),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0)
});

const drawing = z.object({
  id: z.string().max(120).optional(),
  type: z.enum(['line', 'square', 'circle', 'measure']).or(z.string().max(40)),
  measurement: z.boolean().optional(),
  color: z.string().max(40).default('#2563eb'),
  filled: z.boolean().default(false),
  start: point,
  end: point
});

const entity = z.object({
  id: z.string().max(120),
  type: z.enum(['player', 'mob', 'charmie']).default('player'),
  name: z.string().trim().min(1).max(120),
  image: largeString.default(''),
  hp: z.number().int().min(0).max(100000),
  maxHp: z.number().int().min(1).max(100000),
  ownerId: z.string().max(120).nullable().optional(),
  x: z.number().int().min(1).max(99).nullable().optional(),
  y: z.number().int().min(1).max(99).nullable().optional()
});

export const createMapSchema = z.object({
  groupName,
  mapName,
  gridSize: gridSize.optional(),
  gridWidth: gridDimension.optional(),
  gridHeight: gridDimension.optional()
}).transform((body) => {
  const fallback = body.gridSize ?? 40;
  return {
    ...body,
    gridSize: fallback,
    gridWidth: body.gridWidth ?? fallback,
    gridHeight: body.gridHeight ?? fallback
  };
});

export const replaceMapSchema = z.object({
  gridSize: gridSize.optional(),
  gridWidth: gridDimension.optional(),
  gridHeight: gridDimension.optional(),
  cellSize: z.number().int().min(20).max(120).default(50),
  backgroundImage: backgroundImage.default({}),
  drawings: z.array(drawing).max(2000).default([]),
  entities: z.array(entity).max(1000).default([]),
  tiles: z.array(z.object({
    x: z.number().int().min(1).max(99),
    y: z.number().int().min(1).max(99),
    layer,
    tileCode
  })).default([]),
  notes: z.array(z.string().max(2000)).default([])
}).transform((body) => ({
  ...body,
  gridWidth: body.gridWidth ?? body.gridSize,
  gridHeight: body.gridHeight ?? body.gridSize
}));

export const tilePatchSchema = z.object({
  x: z.number().int().min(1).max(99),
  y: z.number().int().min(1).max(99),
  tileCode,
  layer: layer.optional(),
  erase: z.boolean().default(false)
});

export function validate(schema, value) {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  const error = new Error(message || 'Invalid request body');
  error.status = 400;
  throw error;
}
