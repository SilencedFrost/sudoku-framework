import { HOUSE_SIZE, UNIT_SIZE, BOARD_SIZE } from "./board.js";

type Indices = readonly number[];

// Load-time helpers (not exported). Row-major layout, 0-based
const rowOf = (i: number): number => Math.floor(i / HOUSE_SIZE);
const colOf = (i: number): number => i % HOUSE_SIZE;
const boxOf = (i: number): number => Math.floor(rowOf(i) / UNIT_SIZE) * UNIT_SIZE + Math.floor(colOf(i) / UNIT_SIZE);

export const BOARD: Indices = Array.from({ length: BOARD_SIZE }, (_, i) => i);

const buildUnit = (keyOf: (i: number) => number): readonly Indices[] => BOARD.map((i) => BOARD.filter((j) => keyOf(j) === keyOf(i)));
const buildUnits = (size: number, keyOf: (i: number) => number): readonly Indices[] => Array.from({ length: size }, (_, key) => BOARD.filter((i) => keyOf(i) === key));
const buildUnitOutsideBox = (keyOf: (i: number) => number): readonly Indices[] => BOARD.map((i) => BOARD.filter((j) => keyOf(j) === keyOf(i) && boxOf(j) !== boxOf(i)));
const buildBoxOutsideLine = (keyOf: (i: number) => number): readonly Indices[] => BOARD.map((i) => BOARD.filter((j) => boxOf(j) === boxOf(i) && keyOf(j) !== keyOf(i)));

// Cell -> members of its unit (Self included)
export const ROW_OF: readonly Indices[] = buildUnit(rowOf);
export const COLUMN_OF: readonly Indices[] = buildUnit(colOf);
export const BOX_OF: readonly Indices[] = buildUnit(boxOf);
// Pointing pairs/triplets
export const ROW_OUTSIDE_BOX_OF: readonly Indices[] = buildUnitOutsideBox(rowOf);
export const COLUMN_OUTSIDE_BOX_OF: readonly Indices[] = buildUnitOutsideBox(colOf);
// Claiming
export const BOX_OUTSIDE_ROW_OF: readonly Indices[] = buildBoxOutsideLine(rowOf);
export const BOX_OUTSIDE_COLUMN_OF: readonly Indices[] = buildBoxOutsideLine(colOf);

// Unit -> members resolvers
export const ROWS: readonly Indices[] = buildUnits(HOUSE_SIZE, rowOf);
export const COLUMNS: readonly Indices[] = buildUnits(HOUSE_SIZE, colOf);
export const BOXES: readonly Indices[] = buildUnits(HOUSE_SIZE, boxOf);
export const LINES: readonly Indices[] = [...ROWS, ...COLUMNS];
export const HOUSES: readonly Indices[] = [...ROWS, ...COLUMNS, ...BOXES];

// Peers resolver (Self excluded)
export const PEERS: readonly Indices[] = BOARD.map((i) => BOARD.filter((j) => j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))));
