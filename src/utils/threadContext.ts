import { AsyncLocalStorage } from 'async_hooks';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ThreadContextStore = Map<string, any>

export const threadContext = new AsyncLocalStorage<ThreadContextStore>();
export const THREAD_CONTEXT_KEY_ADDITIONAL_HEADERS = 'additionalHeaders';
