/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';

import { storage } from './storage.js';
import { MicroserviceMethodConfig, PartialBy } from '../types/index.js';
import { camelCase } from '../utils.js';

export type MethodDecoratorOptions<T, R> =
  { name?: string } &
  PartialBy<Omit<MicroserviceMethodConfig<R, T>, 'handler'>, 'subject' | 'metadata'>;

type Method<T, R> = ((request?: T) => Promise<R>) | ((request?: T) => R);

export function method<
  T extends z.ZodType<any, any, any>,
  R extends z.ZodType<any, any, any>,
>(options?: MethodDecoratorOptions<z.infer<T>, z.infer<R>>) {

  return (
    target: unknown,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<((request?: z.infer<T>) => any)>,
  ): TypedPropertyDescriptor<Method<z.infer<T>, z.infer<R>>> | void => {

    const name = options?.name ?? camelCase(String(key));

    if (!descriptor.value)
      throw new Error('Use method decorators only on class methods');

    const ms = storage.ensureAdded(target);

    ms.config.methods[name] = {
      handler: descriptor.value,
      ...options,
    };

    return descriptor;
  };
}
