import { errorText, errorTextTemplates } from '../i18n/errors';

interface ErrorPattern {
  pattern: RegExp;
  describe: (match: RegExpExecArray) => string;
}

// These complete messages are defined by domain/sweeps/searchSpace.ts.
// Captures are data, so parameter names and values are preserved verbatim.
const errorPatterns: ErrorPattern[] = [
  {
    pattern: /^parameter「(.*)」の values が空です$/s,
    describe: (match) => errorTextTemplates.sweepValuesEmpty(match[1]!),
  },
  {
    pattern: /^parameter「(.*)」の values は([0-9]+)個までです（([0-9]+)個）$/s,
    describe: (match) => errorTextTemplates.sweepValuesLimit(match[1]!, match[2]!, match[3]!),
  },
  {
    pattern: /^parameter「(.*)」の values には文字列・有限の数値・真偽値だけを使えます$/s,
    describe: (match) => errorTextTemplates.sweepValuesTypes(match[1]!),
  },
  {
    pattern: /^parameter「(.*)」の values に重複した値 (.*) があります$/s,
    describe: (match) => errorTextTemplates.sweepValuesDuplicate(match[1]!, match[2]!),
  },
  {
    pattern: /^parameter「(.*)」の distribution「(.*)」は使えません$/s,
    describe: (match) => errorTextTemplates.sweepDistributionUnsupported(match[1]!, match[2]!),
  },
  {
    pattern: /^parameter「(.*)」の min と max には有限の数値が必要です$/s,
    describe: (match) => errorTextTemplates.sweepRangeFinite(match[1]!),
  },
  {
    pattern: /^parameter「(.*)」は min < max である必要があります（min=(.*), max=(.*)）$/s,
    describe: (match) => errorTextTemplates.sweepRangeOrder(match[1]!, match[2]!, match[3]!),
  },
  {
    pattern: /^parameter「(.*)」は log_uniform なので min > 0 である必要があります（min=(.*)）$/s,
    describe: (match) => errorTextTemplates.sweepLogUniformPositive(match[1]!, match[2]!),
  },
  {
    pattern: /^parameter「(.*)」は int_uniform なので min と max は整数である必要があります$/s,
    describe: (match) => errorTextTemplates.sweepRangeIntegers(match[1]!),
  },
  {
    pattern: /^parameter「(.*)」の q は q_uniform のときだけ指定できます$/s,
    describe: (match) => errorTextTemplates.sweepQuantumDistribution(match[1]!),
  },
  {
    pattern: /^parameter「(.*)」の q は正の数である必要があります（q=(.*)）$/s,
    describe: (match) => errorTextTemplates.sweepQuantumPositive(match[1]!, match[2]!),
  },
  {
    pattern: /^parameter「(.*)」の q が min から max までの幅より大きいです（q=(.*)）$/s,
    describe: (match) => errorTextTemplates.sweepQuantumWidth(match[1]!, match[2]!),
  },
  {
    pattern: /^parameter「(.*)」の定義がありません$/s,
    describe: (match) => errorTextTemplates.sweepDefinitionMissing(match[1]!),
  },
  {
    pattern: /^parameter「(.*)」には values・value・distribution のどれか1つだけを指定してください$/s,
    describe: (match) => errorTextTemplates.sweepDefinitionAmbiguous(match[1]!),
  },
  {
    pattern: /^parameter「(.*)」の value には文字列・有限の数値・真偽値だけを使えます$/s,
    describe: (match) => errorTextTemplates.sweepValueTypes(match[1]!),
  },
  {
    pattern: /^parameter は([0-9]+)個までです（([0-9]+)個）$/s,
    describe: (match) => errorTextTemplates.sweepParameterLimit(match[1]!, match[2]!),
  },
  {
    pattern: /^grid では values か value の parameter だけを使えます（連続分布: (.*)）$/s,
    describe: (match) => errorTextTemplates.sweepGridContinuous(match[1]!),
  },
  {
    pattern: /^grid の組み合わせ数は([0-9]+)までです（([0-9]+)通り）$/s,
    describe: (match) => errorTextTemplates.sweepGridLimit(match[1]!, match[2]!),
  },
];

export function formatSweepSpaceError(message: string): string | null {
  if (message === 'parameter 名が空です') return errorText.sweepParameterNameEmpty;
  if (message === 'parameter が1つもありません') return errorText.sweepParametersEmpty;
  for (const entry of errorPatterns) {
    const match = entry.pattern.exec(message);
    if (match) return entry.describe(match);
  }
  return null;
}
