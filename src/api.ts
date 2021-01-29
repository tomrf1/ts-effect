import {Either, fold, left, right} from './either';
import {Completable, Complete, Effect} from "./effect";
import {ContinuationStack} from "./continuationStack";

// An Effect that cannot fail
const succeed = <A>(a: A): SucceedEffect<void,A> => new SucceedEffect<void,A>(a);
// Sometimes it's useful to give an error type anyway, e.g. when using manage
const succeedFull = <E,A>(a: A): SucceedEffect<E,A> => new SucceedEffect<E,A>(a);
export class SucceedEffect<E,A> extends Effect<E,A> {
    value: A;
    constructor(a: A) {
        super('SucceedEffect');
        this.value = a;
    }
}

const flatMap = <EA,EB,A,B>(effect: Effect<EA,A>, f: (a: A) => Effect<EB,B>): FlatMapEffect<EA,EB,A,B> => new FlatMapEffect<EA,EB,A,B>(effect, f);
export class FlatMapEffect<EA,EB,A,B> extends Effect<EB,B> {
    effect: Effect<EA,A>;
    f: (a: A) => Effect<EB,B>;

    constructor(e: Effect<EA,A>, f: (a: A) => Effect<EB,B>) {
        super('FlatMapEffect');
        this.effect = e;
        this.f = f;
    }
}

// Warning - if the computation is not genuinely async then this is not stack-safe
const async = <E,A>(c: Completable<E,A>): AsyncEffect<E,A> => new AsyncEffect<E,A>(c);
export class AsyncEffect<E,A> extends Effect<E,A> {
    completable: Completable<E,A>;

    constructor(c: Completable<E,A>) {
        super('AsyncEffect');
        this.completable = c;
    }
}

const sync = <E,A>(f: () => A): SyncEffect<E,A> => new SyncEffect<E,A>(f);
export class SyncEffect<E,A> extends Effect<E,A> {
    f: () => A;

    constructor(f: () => A) {
        super('SyncEffect');
        this.f = f;
    }
}

const fail = <E,A>(error: E): FailEffect<E,A> => new FailEffect<E,A>(error);
export class FailEffect<E,A> extends Effect<E,A> {
    error: E;
    constructor(error: E) {
        super('FailEffect');
        this.error = error;
    }
}

const recover = <E1,E2,A>(effect: Effect<E1,A>, recover: (e: E1) => Effect<E2,A>): RecoverEffect<E1,E2,A> => new RecoverEffect<E1,E2,A>(effect, recover);
export class RecoverEffect<E1,E2,A> extends Effect<E2,A> {
    effect: Effect<E1,A>;
    r: (e: E1) => Effect<E2,A>;
    constructor(effect: Effect<E1,A>, recover: (e: E1) => Effect<E2,A>) {
        super('RecoverEffect');
        this.effect = effect;
        this.r = recover;
    }
}

// Run the program described by the Effect. We (mostly) ensure stack-safety by pushing continuations to a stack inside a loop
const run = <E,A>(effect: Effect<E,A>) => (complete: Complete<E,A>, stack: ContinuationStack<E,A>): void => {
    let current: Effect<any,any> | null = effect;

    while (current !== null) {
        const e: Effect<any,any> = current;

        try {
            switch (e.type) {
                case 'SucceedEffect': {
                    const succeedEffect = e as SucceedEffect<any,any>;
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
                    const syncEffect = e as SyncEffect<any,any>;
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
                    const asyncEffect = e as AsyncEffect<any,any>;

                    // If the effect is not truly async then this is not stack-safe
                    asyncEffect.completable((result: Either<any,any>) => {
                        fold(result)(
                            a => {
                                const next = stack.nextSuccess();
                                if (next) {
                                    run(next.f(a) as Effect<any,any>)(complete, stack);
                                } else {
                                    complete(right(a));
                                }
                            },
                            err => {
                                const next = stack.nextFailure();
                                if (next) {
                                    run(next.f(err) as Effect<any,any>)(complete, stack);
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
                    const flatMapEffect = e as FlatMapEffect<any,any,any,any>;
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
                        complete(left(failEffect.error));
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
                    current = fail(Error(`Unknown Effect type found by interpreter: ${e.type}`));
            }
        } catch (err) {
            current = fail(err);
        }
    }
};

// Create an AsyncEffect from a Promise
const asyncP = <E,A>(lazy: () => Promise<A>): Effect<E,A> => async((complete: Complete<E,A>) =>
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
const manage = <E,A,B>(acquire: Effect<E,A>, release: (a: A) => void, f: (a: A) => Effect<E,B>): Effect<E,B> =>
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

// Each chain function type overload here ensures type safety for the caller
function chain<E,A,B>(ea: Effect<E,A>, fs: [(a: A) => Effect<E,B>]): Effect<E,B>;
function chain<E,A,B,C>(ea: Effect<E,A>, fs: [(a: A) => Effect<E,B>, (b: B) => Effect<E,C>]): Effect<E,C>;
function chain<E,A,B,C,D>(ea: Effect<E,A>, fs: [(a: A) => Effect<E,B>, (b: B) => Effect<E,C>, (c: C) => Effect<E,D>]): Effect<E,D>;
function chain<E,A,B,C,D,EE>(ea: Effect<E,A>, fs: [(a: A) => Effect<E,B>, (b: B) => Effect<E,C>, (c: C) => Effect<E,D>, (d: D) => Effect<E,EE>]): Effect<E,EE>;
function chain<E,A,B,C,D,EE,F>(ea: Effect<E,A>, fs: [(a: A) => Effect<E,B>, (b: B) => Effect<E,C>, (c: C) => Effect<E,D>, (d: D) => Effect<E,E>, (e: E) => Effect<E,F>]): Effect<E,F>;
function chain<E,A>(ea: Effect<E,A>, fs: ((x: any) => Effect<E,any>)[]): Effect<E,any> {
    return fs.reduce(
        (e, f) => e.flatMap(f),
        ea
    );
}

// type hacking to make `allG` accept a generic tuple type
type ExtractType<E,T> = { [K in keyof T]: T[K] extends Effect<E,infer V> ? V : never };

/**
 * Given an array of Effects, returns an Effect whose result is an array of the resulting values.
 * The input array of Effects may be heterogeneous.
 *
 * Note - the compiler needs help with the type parameter here if you wish to handle the result as a tuple rather than an array, e.g.
 *   `allG<[Effect<number>,Effect<string>]>([E.succeed(1), E.succeed('a')]).map(([n,s]) => ...)`
 *
 * TODO - should error type also be heterogeneous?
 */
const allG = <E,T extends Effect<E,any>[]>(
    arr: T
): Effect<E,ExtractType<E,T>> => {
    return async((completeAll: Complete<E,ExtractType<E,T>>) => {
        let hasFailed = false;
        const buffer: any[] = [];
        arr.forEach(e => e.run(result => fold(result)(
            a => {
                if (!hasFailed) {
                    buffer.push(a);
                    if (buffer.length === arr.length) completeAll(right(buffer as ExtractType<E,T>));
                }
            },
            err => {
                // TODO - support interrupts?
                hasFailed = true;
                completeAll(left(err));
            }
        )))
    });
};

const all = <E,A>(arr: Effect<E,A>[]): Effect<E,A[]> => allG(arr);

export {
    succeed,
    succeedFull,
    flatMap,
    async,
    sync,
    fail,
    recover,
    run,
    asyncP,
    manage,
    all,
    allG,
    chain
}