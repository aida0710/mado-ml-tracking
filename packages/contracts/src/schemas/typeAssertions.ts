/**
 * zodのスキーマと契約の型が同じ値を表すことを、コンパイル時に確かめる。各スキーマのファイルは
 * `type _X = Expect<MutuallyAssignable<z.infer<typeof xSchema>, X>>`を宣言する。契約の型の
 * 必須のフィールドが、スキーマを変えずに増えたり減ったり変わったりすると、tscが失敗する。
 */
export type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type Expect<T extends true> = T;
