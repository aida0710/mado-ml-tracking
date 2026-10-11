import { describe, expect, it } from 'vitest';
import { projectPathForMlflowUiHash } from './mlflowUiPaths';

const EXPERIMENT_ID = '0b9c2d4e-1f3a-4b5c-8d6e-7f8091a2b3c4';
const RUN_ID = '5d6e7f80-91a2-4b3c-8d4e-5f60718293a4';

describe('projectPathForMlflowUiHash', () => {
  it('ライブラリの「View run」のリンクは、その Run の画面を開く', () => {
    expect(projectPathForMlflowUiHash(`#/experiments/${EXPERIMENT_ID}/runs/${RUN_ID}`)).toBe(
      `runs/${RUN_ID}`,
    );
  });

  it('Run の下のタブや ?workspace= が付いていても、その Run の画面を開く', () => {
    expect(
      projectPathForMlflowUiHash(`#/experiments/${EXPERIMENT_ID}/runs/${RUN_ID}/artifacts/model`),
    ).toBe(`runs/${RUN_ID}`);
    expect(
      projectPathForMlflowUiHash(`#/experiments/${EXPERIMENT_ID}/runs/${RUN_ID}?workspace=team`),
    ).toBe(`runs/${RUN_ID}`);
  });

  it('ライブラリの「View experiment」のリンクは、その実験を選んだ実験の画面を開く', () => {
    expect(projectPathForMlflowUiHash(`#/experiments/${EXPERIMENT_ID}`)).toBe(
      `experiments?experiment=${EXPERIMENT_ID}`,
    );
    expect(projectPathForMlflowUiHash(`#/experiments/${EXPERIMENT_ID}/models`)).toBe(
      `experiments?experiment=${EXPERIMENT_ID}`,
    );
  });

  it('登録モデルのリンクはモデルの一覧を開く', () => {
    expect(projectPathForMlflowUiHash('#/models/classifier/versions/3')).toBe('models');
  });

  it('# の無いトラッキング URI や知らない画面は実験の画面を開く', () => {
    expect(projectPathForMlflowUiHash('')).toBe('experiments');
    expect(projectPathForMlflowUiHash('#/')).toBe('experiments');
    expect(projectPathForMlflowUiHash('#/compare-runs?runs=[]')).toBe('experiments');
  });

  it('ID に入った記号は画面のパスを壊さないように符号化する', () => {
    expect(projectPathForMlflowUiHash('#/experiments/e/runs/a%2Fb')).toBe('runs/a%2Fb');
    expect(projectPathForMlflowUiHash('#/experiments/a&b')).toBe('experiments?experiment=a%26b');
  });
});
