import { DomainError } from './errors.js';

/**
 * An Experiment's name is unique in its Project, deleted Experiments included: MLflow can restore
 * one, and it must come back under its own name. Shared by the native and MLflow APIs.
 */
export function duplicateExperimentName(): never {
  throw new DomainError(
    409,
    '同じ名前の実験が既にあります（削除した実験を含みます）。既存の実験を使うか、別の名前にしてください',
    'resource_already_exists',
  );
}
