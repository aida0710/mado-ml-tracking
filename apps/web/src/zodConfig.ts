import { z } from 'zod';

// 画面は'unsafe-eval'を含まないContent-Security-Policyの下で動く（deploy/nginx.conf）。この設定が
// 無いと、Zodはobjectのschemaを作るときに、速いパーサーをコンパイルするため`new Function`を試す。
// Zodはその後コンパイルしないパーサーで続けるが、ブラウザはその試みを違反として報告する。画面が
// 確かめる応答の量なら、コンパイルしたパーサーが無くても十分に速い。Zodはこの設定をschemaを作る
// ときに読むので、main.tsxはschemaを定義するどのモジュールよりも先にこのモジュールをimportする。
z.config({ jitless: true });
