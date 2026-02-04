import { createRequire } from 'module';
import type { ErrorObject, ValidateFunction } from 'ajv';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020') as typeof import('ajv/dist/2020.js').default;

import type { Issue } from './issues.js';
import type { ThsSchema } from './types.js';
import { loadThsJsonSchema } from './thsJsonSchema.js';

let validateFn: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (validateFn) return validateFn;

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false
  });

  const schema = loadThsJsonSchema();
  const compiled = ajv.compile(schema as any);
  validateFn = compiled;
  return compiled;
}

function ajvErrorsToIssues(errors: ErrorObject[] | null | undefined): Issue[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((err) => {
    const path = err.instancePath && err.instancePath.length > 0 ? err.instancePath : '/';
    const message = err.message ? err.message : 'Invalid value.';
    return {
      severity: 'error',
      code: `structural.${err.keyword}`,
      path,
      message
    };
  });
}

export function validateThsStructural(input: unknown): { ok: boolean; issues: Issue[]; data?: ThsSchema } {
  const validate = getValidator();
  const ok = Boolean(validate(input));
  const issues = ok ? [] : ajvErrorsToIssues(validate.errors);
  return ok ? { ok, issues, data: input as ThsSchema } : { ok, issues };
}
