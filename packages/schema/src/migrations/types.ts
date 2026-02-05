import type { ThsSchema } from '../types.js';

export type ThsMigration = {
  id: string;
  description: string;
  up: (schema: ThsSchema) => ThsSchema;
  down: (schema: ThsSchema) => ThsSchema;
};

