// 音声ファイルのヘッダーから、保存されたサンプルレートを読む。
// Web AudioのdecodeAudioDataはデコードするコンテキストのレートにリサンプリングするので、
// ビューアは元のレートを先に読み、そのレートのOfflineAudioContextでデコードする。これが無いと、
// 16kHzの録音にサウンドカードのレート（多くは48kHz）を表示してしまう。

const ascii = (view: DataView, offset: number, length: number) =>
  offset + length > view.byteLength
    ? ''
    : String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length));

function readWaveSampleRate(view: DataView): number | null {
  if (ascii(view, 0, 4) !== 'RIFF' || ascii(view, 8, 4) !== 'WAVE') return null;
  for (let offset = 12; offset + 8 <= view.byteLength; ) {
    const chunkSize = view.getUint32(offset + 4, true);
    if (ascii(view, offset, 4) === 'fmt ' && offset + 16 <= view.byteLength)
      return view.getUint32(offset + 12, true);
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return null;
}

function readFlacSampleRate(view: DataView): number | null {
  // STREAMINFOは必ず最初のメタデータブロックで、レートはバイト18からの上位20ビット。
  if (ascii(view, 0, 4) !== 'fLaC' || view.byteLength < 22) return null;
  return (view.getUint8(18) << 12) | (view.getUint8(19) << 4) | (view.getUint8(20) >> 4);
}

const MPEG_SAMPLE_RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

const MPEG_SYNC_SCAN_BYTES = 64 * 1024;

function readMpegSampleRate(view: DataView): number | null {
  let offset = 0;
  if (ascii(view, 0, 3) === 'ID3' && view.byteLength >= 10) {
    // ID3v2のサイズは、10バイトのヘッダーの後ろにある28ビットのsynchsafe整数。
    const size =
      ((view.getUint8(6) & 0x7f) << 21) |
      ((view.getUint8(7) & 0x7f) << 14) |
      ((view.getUint8(8) & 0x7f) << 7) |
      (view.getUint8(9) & 0x7f);
    offset = 10 + size;
  }
  // フレームヘッダーはタグのすぐ後ろに来る。それより先まで探しても、ほかの形式の偽の同期を拾うだけ。
  const scanEnd = Math.min(view.byteLength, offset + MPEG_SYNC_SCAN_BYTES);
  for (; offset + 4 <= scanEnd; offset += 1) {
    if (view.getUint8(offset) !== 0xff || (view.getUint8(offset + 1) & 0xe0) !== 0xe0) continue;
    // Layer 0は予約済み。AACのADTSヘッダーは同期ワードが同じだが、必ずlayer 0を持つ。
    if (((view.getUint8(offset + 1) >> 1) & 0x03) === 0) continue;
    const version = (view.getUint8(offset + 1) >> 3) & 0x03;
    const rateIndex = (view.getUint8(offset + 2) >> 2) & 0x03;
    const rate = MPEG_SAMPLE_RATES[version]?.[rateIndex];
    if (rate) return rate;
  }
  return null;
}

function readOggSampleRate(view: DataView): number | null {
  if (ascii(view, 0, 4) !== 'OggS' || view.byteLength < 28) return null;
  const payload = 27 + view.getUint8(26);
  // Opusは、ヘッダーに保存された入力のレートにかかわらず、常に48kHzでデコードする。
  if (ascii(view, payload, 8) === 'OpusHead') return 48000;
  if (ascii(view, payload + 1, 6) === 'vorbis' && payload + 16 <= view.byteLength)
    return view.getUint32(payload + 12, true);
  return null;
}

/** 保存されたサンプルレート。コンテナがWAV、FLAC、MP3、Oggのどれでもなければnull。 */
export function readAudioSampleRate(buffer: ArrayBuffer): number | null {
  const view = new DataView(buffer);
  const rate =
    readWaveSampleRate(view) ?? readFlacSampleRate(view) ?? readOggSampleRate(view) ?? readMpegSampleRate(view);
  return rate && rate > 0 ? rate : null;
}
