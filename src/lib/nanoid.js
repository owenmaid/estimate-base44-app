import { createStableId } from './reliability';

export const nanoid = (size = 8) =>
  createStableId('').replaceAll('-', '').slice(0, size);