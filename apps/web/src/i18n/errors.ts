import * as english from './en/errors';
import { localized } from './localized';

// Text for API errors (lib/errorMessage.ts, lib/sweepSpaceError.ts). For the codes, the Japanese screen
// shows the server's own message when there is one, so these Japanese entries are its fallback.
export const errorText = localized({
  internalError: 'リクエストの処理に失敗しました',
  databaseUnavailable: 'データベースに接続できません',
  pluginRequestFailed: '連携先との通信に失敗しました',
  pluginDisabled: '連携は無効です',
  uploadNotOpen: 'このアップロードはデータを受け付けていません',
  uploadExpired: 'アップロードの有効期限が切れています',
  artifactSaveFailed: 'Artifactを保存できませんでした',
  partChecksumMismatch: 'アップロードしたpartのSHA-256が一致しません',
  runDeleted: '削除済みのRunにはこの操作を行えません',
  bodyTooLarge: 'リクエストが上限サイズを超えています',
  sweepParameterNameEmpty: 'parameter 名が空です',
  sweepParametersEmpty: 'parameter が1つもありません',
  sweepRangeFields: 'min・max',
} as const, english.errorText);

export const errorTextTemplates = localized({
  sweepParameterLocation: (name: string) => `parameter「${name}」`,
  sweepValuesEmpty: (name: string) =>
    `parameter「${name}」の values が空です`,
  sweepValuesLimit: (name: string, limit: string, count: string) =>
    `parameter「${name}」の values は${limit}個までです（${count}個）`,
  sweepValuesTypes: (name: string) =>
    `parameter「${name}」の values には文字列・有限の数値・真偽値だけを使えます`,
  sweepValuesDuplicate: (name: string, value: string) =>
    `parameter「${name}」の values に重複した値 ${value} があります`,
  sweepDistributionUnsupported: (name: string, distribution: string) =>
    `parameter「${name}」の distribution「${distribution}」は使えません`,
  sweepRangeFinite: (name: string) =>
    `parameter「${name}」の min と max には有限の数値が必要です`,
  sweepRangeOrder: (name: string, min: string, max: string) =>
    `parameter「${name}」は min < max である必要があります（min=${min}, max=${max}）`,
  sweepLogUniformPositive: (name: string, min: string) =>
    `parameter「${name}」は log_uniform なので min > 0 である必要があります（min=${min}）`,
  sweepRangeIntegers: (name: string) =>
    `parameter「${name}」は int_uniform なので min と max は整数である必要があります`,
  sweepQuantumDistribution: (name: string) =>
    `parameter「${name}」の q は q_uniform のときだけ指定できます`,
  sweepQuantumPositive: (name: string, q: string) =>
    `parameter「${name}」の q は正の数である必要があります（q=${q}）`,
  sweepQuantumWidth: (name: string, q: string) =>
    `parameter「${name}」の q が min から max までの幅より大きいです（q=${q}）`,
  sweepDefinitionMissing: (name: string) =>
    `parameter「${name}」の定義がありません`,
  sweepDefinitionAmbiguous: (name: string) =>
    `parameter「${name}」には values・value・distribution のどれか1つだけを指定してください`,
  sweepValueTypes: (name: string) =>
    `parameter「${name}」の value には文字列・有限の数値・真偽値だけを使えます`,
  sweepParameterLimit: (limit: string, count: string) =>
    `parameter は${limit}個までです（${count}個）`,
  sweepGridContinuous: (names: string) =>
    `grid では values か value の parameter だけを使えます（連続分布: ${names}）`,
  sweepGridLimit: (limit: string, count: string) =>
    `grid の組み合わせ数は${limit}までです（${count}通り）`,
} as const, english.errorTextTemplates);
