import {Either, fold, left, right} from './either';
import {Completable, Complete, Effect} from "./effect";
import {ContinuationStack} from "./continuationStack";

const succeed = <A>(a: A): SucceedEffect<A> => new SucceedEffect<A>(a);
export class SucceedEffect<A> extends Effect<A> {
    value: A;
    constructor(a: A) {
        super('SucceedEffect');
        this.value = a;
    }
}

const flatMap = <A,B>(effect: Effect<A>, f: (a: A) => Effect<B>): FlatMapEffect<A,B> => new FlatMapEffect<A, B>(effect, f);
export class FlatMapEffect<A,B> extends Effect<B> {
    effect: Effect<A>;
    f: (a: A) => Effect<B>;

    constructor(e: Effect<A>, f: (a: A) => Effect<B>) {
        super('FlatMapEffect');
        this.effect = e;
        this.f = f;
    }
}

// Warning - if the computation is not genuinely async then this is not stack-safe
const async = <A>(c: Completable<A>): AsyncEffect<A> => new AsyncEffect<A>(c);
export class AsyncEffect<A> extends Effect<A> {
    completable: Completable<A>;

    constructor(c: Completable<A>) {
        super('AsyncEffect');
        this.completable = c;
    }
}

const sync = <A>(f: () => A): SyncEffect<A> => new SyncEffect<A>(f);
export class SyncEffect<A> extends Effect<A> {
    f: () => A;

    constructor(f: () => A) {
        super('SyncEffect');
        this.f = f;
    }
}

const fail = <A>(error: Error): FailEffect<A> => new FailEffect<A>(error);
export class FailEffect<A> extends Effect<A> {
    error: Error;
    constructor(error: Error) {
        super('FailEffect');
        this.error = error;
    }
}

const recover = <A>(effect: Effect<A>, recover: (e: Error) => Effect<A>): RecoverEffect<A> => new RecoverEffect<A>(effect, recover);
export class RecoverEffect<A> extends Effect<A> {
    effect: Effect<A>;
    r: (e: Error) => Effect<A>;
    constructor(effect: Effect<A>, recover: (e: Error) => Effect<A>) {
        super('RecoverEffect');
        this.effect = effect;
        this.r = recover;
    }
}

// Run the program described by the Effect. We (mostly) ensure stack-safety by pushing continuations to a stack inside a loop
const run = <A>(effect: Effect<A>) => (complete: Complete<A>, stack: ContinuationStack<A>): void => {
    let current: Effect<any> | null = effect;

    while (current !== null) {
        const e: Effect<any> = current;

        try {
            switch (e.type) {
                case 'SucceedEffect': {
                    const succeedEffect = e as SucceedEffect<any>;
                    const next = stack.nextSuccess();
                    if (next) {
                        current = next.f(succeedEffect.value)
                    } else {
                        current = null;
                        complete(right(succeedEffect.value))
                    }

                    break;
                }
                case 'SyncEffect': {
                    const syncEffect = e as SyncEffect<any>;
                    const next = stack.nextSuccess();
                    const result = syncEffect.f();
                    if (next) {
                        current = next.f(result)
                    } else {
                        current = null;
                        complete(right(result))
                    }

                    break;
                }
                case 'AsyncEffect': {
                    const asyncEffect = e as AsyncEffect<any>;

                    // If the effect is not truly async then this is not stack-safe
                    asyncEffect.completable((result: Either<Error, A>) => {
                        fold(result)(
                            a => {
                                const next = stack.nextSuccess();
                                if (next) {
                                    run(next.f(a) as Effect<A>)(complete, stack);
                                } else {
                                    complete(right(a));
                                }
                            },
                            err => {
                                const next = stack.nextFailure();
                                if (next) {
                                    run(next.f(err) as Effect<A>)(complete, stack);
                                } else {
                                    complete(left(err));
                                }
                            }
                        )
                    });

                    current = null;

                    break;
                }
                case 'FlatMapEffect': {
                    const flatMapEffect = e as FlatMapEffect<any, any>;
                    current = flatMapEffect.effect;
                    stack.pushSuccess(flatMapEffect.f);

                    break;
                }
                case 'FailEffect': {
                    const failEffect = e as FailEffect<any>;
                    const next = stack.nextFailure();
                    if (next) {
                        current = next.f(failEffect.error);
                    } else {
                        current = null;
                        complete(left(failEffect.error));
                    }

                    break;
                }
                case 'RecoverEffect': {
                    const recoverEffect = e as RecoverEffect<any>;
                    current = recoverEffect.effect;
                    stack.pushFailure(recoverEffect.r);

                    break;
                }
                default:
                    current = fail(Error(`Unknown Effect type found by interpreter: ${e.type}`));
            }
        } catch (err) {
            current = fail(err);
        }
    }
};

// Create an AsyncEffect from a Promise
const asyncP = <A>(lazy: () => Promise<A>): Effect<A> => async((complete: Complete<A>) =>
    lazy()
        .then(a => complete(right(a)))
        .catch(err => left(err))
);

/**
 * Produces a new Effect while guaranteeing that a resource will be released.
 *
 * @param acquire   An Effect to acquire the resource
 * @param release   A side-effecting function to release the resource, guaranteed to be run regardless of success
 * @param f         A function that receives the resource and produces an Effect
 */
const manage = <A,B>(acquire: Effect<A>, release: (a: A) => void, f: (a: A) => Effect<B>): Effect<B> =>
    acquire.flatMap(a => {
        try {
            return f(a)
                .map(b => {
                    release(a);
                    return b;
                })
                .mapError(err => {
                    release(a);
                    return err;
                });
        } catch (err) {
            // In case f fails to even produce an effect
            release(a);
            return fail(err);
        }
    });

// type hacking to make `allG` accept a generic tuple type
type ExtractType<T> = { [K in keyof T]: T[K] extends Effect<infer V> ? V : never };

function allG<T extends Effect<any>[]>(
    arr: T
): Effect<ExtractType<T>> {
    return async((completeAll: Complete<ExtractType<T>>) => {
        let hasFailed = false;
        const buffer: any[] = [];
        arr.forEach(e => e.run(result => fold(result)(
            a => {
                if (!hasFailed) {
                    buffer.push(a);
                    if (buffer.length === arr.length) completeAll(right(buffer as ExtractType<T>));
                }
            },
            err => {
                // TODO - support interrupts?
                hasFailed = true;
                completeAll(left(err));
            }
        )))
    });
}

function all<A>(arr: Effect<A>[]): Effect<A[]> {
    return allG(arr);
}

export {
    succeed,
    flatMap,
    async,
    sync,
    fail,
    recover,
    run,
    asyncP,
    manage,
    all,
    allG
}