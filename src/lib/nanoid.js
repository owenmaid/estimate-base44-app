export const nanoid = (size = 8) =>
  Math.random().toString(36).substring(2, 2 + size);