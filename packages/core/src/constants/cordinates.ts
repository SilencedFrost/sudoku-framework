import type { Cordinates } from "../types/common.type.js";

type Indices = readonly number[];

// Load-time helpers (not exported). Row-major layout, 0-based
const rowOf = (i: number): number => Math.floor(i / 9);
const colOf = (i: number): number => i % 9;
const boxOf = (i: number): number => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

const ALL: Indices = Array.from({ length: 81 }, (_, i) => i);

// For each cell, collect every cell index that shares the same unit key (self included).
const buildUnit = (keyOf: (i: number) => number): readonly Indices[] => ALL.map((i) => ALL.filter((j) => keyOf(j) === keyOf(i)));

// For each unit index, collect every cell that belongs to it.
const buildUnits = (size: number, keyOf: (i: number) => number): readonly Indices[] => Array.from({ length: size }, (_, key) => ALL.filter((i) => keyOf(i) === key));

const buildUnitOutsideBox = (keyOf: (i: number) => number): readonly Indices[] => ALL.map((i) => ALL.filter((j) => keyOf(j) === keyOf(i) && boxOf(j) !== boxOf(i)));

// Cell -> members of its unit (Self included)
export const ROW_OF: readonly Indices[] = buildUnit(rowOf);
export const COLUMN_OF: readonly Indices[] = buildUnit(colOf);
export const BOX_OF: readonly Indices[] = buildUnit(boxOf);
export const ROW_OUTSIDE_BOX_OF: readonly Indices[] = buildUnitOutsideBox(rowOf);
export const COLUMN_OUTSIDE_BOX_OF: readonly Indices[] = buildUnitOutsideBox(colOf);

// Unit -> members resolvers
export const ROWS: readonly Indices[] = buildUnits(9, rowOf);
export const COLUMNS: readonly Indices[] = buildUnits(9, colOf);
export const BOXES: readonly Indices[] = buildUnits(9, boxOf);
export const LINES: readonly Indices[] = [...ROWS, ...COLUMNS];
export const HOUSES: readonly Indices[] = [...ROWS, ...COLUMNS, ...BOXES];

// Cordinate-based accessors
export const XY_BOXES: readonly Cordinates<number, 3, 3>[] = BOXES.map(
  (cells) => Array.from({ length: 3 }, (_y, y) => Array.from({ length: 3 }, (_x, x) => cells[y * 3 + x])) as Cordinates<number, 3, 3>,
);

// Peers resolver (Self excluded)
export const PEERS: readonly Indices[] = ALL.map((i) => ALL.filter((j) => j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))));
