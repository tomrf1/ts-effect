import {Complete, Effect} from "./effect";
import {ContinuationStack} from "./continuationStack";
import {AsyncEffect, FailEffect, FlatMapEffect, RecoverEffect, SucceedEffect, SyncEffect} from "./api";
import {Either, failure, fold, success} from "./either";

/**
 * Run the program described by the Effect.
 * We (mostly) ensure stack-safety by pushing continuations to a stack inside a loop.
 * Does not catch exceptions by design.
 */
export const run = <E,A>(effect: Effect<E,A>) => (complete: Complete<E,A>, stack: ContinuationStack): void => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- type safety should have been ensured when the Effect was constructed */
    let current: Effect<any,any> | null = effect;

    while (current !== null) {
        const e: Effect<any,any> = current;

        switch (e.type) {
            case 'SucceedEffect': {
                const succeedEffect = e as SucceedEffect<any,any>;
                const next = stack.nextSuccess();
                if (next) {
                    current = next.f(succeedEffect.value)
                } else {
                    current = null;
                    complete(success(succeedEffect.value))
                }

                break;
            }
            case 'SyncEffect': {
                const syncEffect = e as SyncEffect<any,any>;
                const next = stack.nextSuccess();
                const result = syncEffect.f();
                if (next) {
                    current = next.f(result)
                } else {
                    current = null;
                    complete(success(result))
                }

                break;
            }
            case 'AsyncEffect': {
                const asyncEffect = e as AsyncEffect<any,any>;

                // If the effect is not truly async then this is not stack-safe
                asyncEffect.completable((result: Either<any,any>) => {
                    fold(result)(
                        a => {
                            const next = stack.nextSuccess();
                            if (next) {
                                run(next.f(a) as Effect<any,any>)(complete, stack);
                            } else {
                                complete(success(a));
                            }
                        },
                        err => {
                            const next = stack.nextFailure();
                            if (next) {
                                run(next.f(err) as Effect<any,any>)(complete, stack);
                            } else {
                                complete(failure(err));
                            }
                        }
                    )
                });

                current = null;

                break;
            }
            case 'FlatMapEffect': {
                const flatMapEffect = e as FlatMapEffect<any,any,any>;
                current = flatMapEffect.effect;
                stack.pushSuccess(flatMapEffect.f);

                break;
            }
            case 'FailEffect': {
                const failEffect = e as FailEffect<any,any>;
                const next = stack.nextFailure();
                if (next) {
                    current = next.f(failEffect.error);
                } else {
                    current = null;
                    complete(failure(failEffect.error));
                }

                break;
            }
            case 'RecoverEffect': {
                const recoverEffect = e as RecoverEffect<any,any,any>;
                current = recoverEffect.effect;
                stack.pushFailure(recoverEffect.r);

                break;
            }
            default:
                throw Error(`Unknown Effect type found by interpreter: ${e.type}`);
        }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
};
