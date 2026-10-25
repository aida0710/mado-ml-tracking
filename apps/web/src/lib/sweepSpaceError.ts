import type { SweepSpaceViolation } from '@mmt/contracts';
import { errorText, errorTextTemplates } from '../i18n/errors';

type SweepSpaceDetails = Readonly<Record<string, unknown>>;

/** 横の項目の値。parameter 名と値は API が受け取ったものをそのまま出す。 */
function shown(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  return value === undefined || value === null ? '' : String(value);
}

// 422 sweep_space_invalid の理由（apps/api/src/domain/sweeps/searchSpace.ts）ごとの文。
const VIOLATION_TEXT: Record<SweepSpaceViolation, (details: SweepSpaceDetails) => string> = {
  parameters_empty: () => errorText.sweepParametersEmpty,
  parameter_limit: (details) => errorTextTemplates.sweepParameterLimit(shown(details.limit), shown(details.count)),
  parameter_name_empty: () => errorText.sweepParameterNameEmpty,
  definition_missing: (details) => errorTextTemplates.sweepDefinitionMissing(shown(details.parameter)),
  definition_ambiguous: (details) => errorTextTemplates.sweepDefinitionAmbiguous(shown(details.parameter)),
  values_empty: (details) => errorTextTemplates.sweepValuesEmpty(shown(details.parameter)),
  values_limit: (details) =>
    errorTextTemplates.sweepValuesLimit(shown(details.parameter), shown(details.limit), shown(details.count)),
  values_types: (details) => errorTextTemplates.sweepValuesTypes(shown(details.parameter)),
  values_duplicate: (details) =>
    errorTextTemplates.sweepValuesDuplicate(shown(details.parameter), shown(details.value)),
  value_types: (details) => errorTextTemplates.sweepValueTypes(shown(details.parameter)),
  distribution_unsupported: (details) =>
    errorTextTemplates.sweepDistributionUnsupported(shown(details.parameter), shown(details.distribution)),
  range_finite: (details) => errorTextTemplates.sweepRangeFinite(shown(details.parameter)),
  range_order: (details) =>
    errorTextTemplates.sweepRangeOrder(shown(details.parameter), shown(details.min), shown(details.max)),
  log_uniform_positive: (details) =>
    errorTextTemplates.sweepLogUniformPositive(shown(details.parameter), shown(details.min)),
  range_integers: (details) => errorTextTemplates.sweepRangeIntegers(shown(details.parameter)),
  quantum_distribution: (details) => errorTextTemplates.sweepQuantumDistribution(shown(details.parameter)),
  quantum_positive: (details) => errorTextTemplates.sweepQuantumPositive(shown(details.parameter), shown(details.q)),
  quantum_width: (details) => errorTextTemplates.sweepQuantumWidth(shown(details.parameter), shown(details.q)),
  grid_continuous: (details) => errorTextTemplates.sweepGridContinuous(shown(details.parameters)),
  grid_limit: (details) => errorTextTemplates.sweepGridLimit(shown(details.limit), shown(details.count)),
};

function isViolation(reason: unknown): reason is SweepSpaceViolation {
  return typeof reason === 'string' && Object.hasOwn(VIOLATION_TEXT, reason);
}

/** 422 sweep_space_invalid の横の項目から、今の言語の文を作る。知らない理由なら null。 */
export function formatSweepSpaceError(details: SweepSpaceDetails): string | null {
  return isViolation(details.reason) ? VIOLATION_TEXT[details.reason](details) : null;
}
