import { DomainError } from './errors.js';

/**
 * 実験の名前はProjectの中で一意で、削除した実験も含む。MLflowは削除した実験を復元でき、
 * そのときは元の名前で戻る必要がある。ネイティブAPIとMLflow APIで共有する。
 */
export function duplicateExperimentName(): never {
  throw new DomainError({
    status: 409,
    code: 'already_exists',
    message: 'an experiment with the same name already exists (including deleted experiments); use the existing experiment or choose another name',
  });
}
