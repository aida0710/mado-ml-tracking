// Application-owned error codes; unknown service details are displayed unchanged.
export const errorText = {
  internalError: "Could not process the request",
  databaseUnavailable: "Could not connect to the database",
  pluginRequestFailed: "Could not communicate with the plugin",
  pluginDisabled: "The plugin is disabled",
  uploadNotOpen: "This upload is no longer accepting data",
  uploadExpired: "The upload has expired",
  artifactSaveFailed: "Could not save the artifact",
  partChecksumMismatch: "The uploaded part does not match its SHA-256 checksum",
  runArchived: "This operation is unavailable for archived runs",
  bodyTooLarge: "The request exceeds the size limit",
  sweepParameterNameEmpty: "Parameter names must not be empty",
  sweepParametersEmpty: "At least one parameter is required",
  sweepRangeFields: "min and max",
} as const;

export const errorTextTemplates = {
  sweepParameterLocation: (name: string) => `parameter “${name}”`,
  sweepValuesEmpty: (name: string) =>
    `Parameter “${name}” has no values`,
  sweepValuesLimit: (name: string, limit: string, count: string) =>
    `Parameter “${name}” values exceed the limit of ${limit} (received: ${count})`,
  sweepValuesTypes: (name: string) =>
    `Parameter “${name}” values must be strings, finite numbers, or booleans`,
  sweepValuesDuplicate: (name: string, value: string) =>
    `Parameter “${name}” has a duplicate value: ${value}`,
  sweepDistributionUnsupported: (name: string, distribution: string) =>
    `Parameter “${name}” does not support distribution “${distribution}”`,
  sweepRangeFinite: (name: string) =>
    `Parameter “${name}” min and max must be finite numbers`,
  sweepRangeOrder: (name: string, min: string, max: string) =>
    `Parameter “${name}” requires min < max (min=${min}, max=${max})`,
  sweepLogUniformPositive: (name: string, min: string) =>
    `Parameter “${name}” uses log_uniform and requires min > 0 (min=${min})`,
  sweepRangeIntegers: (name: string) =>
    `Parameter “${name}” uses int_uniform and requires integer min and max`,
  sweepQuantumDistribution: (name: string) =>
    `Parameter “${name}” q can only be specified for q_uniform`,
  sweepQuantumPositive: (name: string, q: string) =>
    `Parameter “${name}” q must be positive (q=${q})`,
  sweepQuantumWidth: (name: string, q: string) =>
    `Parameter “${name}” q exceeds the range from min to max (q=${q})`,
  sweepDefinitionMissing: (name: string) =>
    `Parameter “${name}” has no definition`,
  sweepDefinitionAmbiguous: (name: string) =>
    `Parameter “${name}” must specify exactly one of values, value, or distribution`,
  sweepValueTypes: (name: string) =>
    `Parameter “${name}” value must be a string, finite number, or boolean`,
  sweepParameterLimit: (limit: string, count: string) =>
    `Parameters exceed the limit of ${limit} (received: ${count})`,
  sweepGridContinuous: (names: string) =>
    `Grid search supports only values or value parameters (continuous distributions: ${names})`,
  sweepGridLimit: (limit: string, count: string) =>
    `Grid combinations exceed the limit of ${limit} (requested: ${count})`,
} as const;
