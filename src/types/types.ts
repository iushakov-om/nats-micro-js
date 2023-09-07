export type MaybePromise<T> = T | Promise<T>;

export type PartialBy<T, K extends keyof T> =
  Omit<T, K> & Partial<Pick<T, K>>;