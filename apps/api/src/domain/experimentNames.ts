import { DomainError } from './errors.js';

/**
 * An Experiment's name is unique in its Project, deleted Experiments included: MLflow can restore
 * one, and it must come back under its own name. Shared by the native and MLflow APIs.
 */
export function duplicateExperimentName(): never {
  throw new DomainError({
    status: 409,
    code: 'already_exists',
    message: 'an experiment with the same name already exists (including deleted experiments); use the existing experiment or choose another name',
  });
}
