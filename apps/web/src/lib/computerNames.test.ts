import { describe, expect, it } from 'vitest';
import { computerNameOf } from './computerNames';

const DELETED = '削除されたコンピュータ';
const usable = [{ id: 'target-public', name: 'GPUサーバー A' }];
const everyComputer = [...usable, { id: 'target-bob', name: 'Bob PC' }];

describe('コンピュータの名前', () => {
  it('使えるコンピュータは、全体の一覧が届く前から名前で出る', () => {
    expect(computerNameOf({ known: usable, computers: undefined, targetId: 'target-public', deletedLabel: DELETED })).toBe(
      'GPUサーバー A',
    );
  });

  it('自分が使えない他人のPrivateのコンピュータも、全体の一覧の名前で出る', () => {
    expect(computerNameOf({ known: usable, computers: everyComputer, targetId: 'target-bob', deletedLabel: DELETED })).toBe(
      'Bob PC',
    );
  });

  it('どちらの一覧にも無いコンピュータは削除されたものとして出る', () => {
    expect(computerNameOf({ known: usable, computers: everyComputer, targetId: 'target-gone', deletedLabel: DELETED })).toBe(
      DELETED,
    );
  });

  it('知らないコンピュータは、全体の一覧が届くまでIDを出さずに空にする', () => {
    expect(computerNameOf({ known: usable, computers: undefined, targetId: 'target-bob', deletedLabel: DELETED })).toBe('');
  });
});
