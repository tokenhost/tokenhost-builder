export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  severity: IssueSeverity;
  code: string;
  path: string;
  message: string;
}

