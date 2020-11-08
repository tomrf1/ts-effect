import {Either, fold, left, right} from './either';
import {Completable, Complete, Effect} from "./effect";

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

// As composed Effects are interpreted they are added to a stack of Continuations, which includes any error handlers
interface Continuation<A,B> {
    type: 'Success' | 'Failure';
    f: (x: A) => Effect<B>;
}
const successContinuation = <A,B>(f: (x: A) => Effect<B>): Continuation<A,B> => ({type: 'Success', f});
const failureContinuation = <B>(f: (x: Error) => Effect<B>): Continuation<Error,B> => ({type: 'Failure', f});

const nextContinuation = (stack: Continuation<any,any>[], type: 'Success' | 'Failure'): Continuation<any,any> | undefined => {
    // Discard any Continuations until an appropriate handler is found
    let next = stack.pop();
    while (next && next.type !== type) {
        next = stack.pop();
    }
    return next;
};
const nextSuccess = (stack: Continuation<any,any>[]) => nextContinuation(stack, 'Success');
const nextFailure = (stack: Continuation<any,any>[]) => nextContinuation(stack, 'Failure');

type ContinuationStack = Continuation<any,any>[];

// Run the program described by the Effect. We ensure stack-safety by pushing continuations to a stack inside a loop
const run = <A>(effect: Effect<A>) => (complete: Complete<A>, stack: ContinuationStack): void => {
    let current: Effect<any> | null = effect;

    while (current !== null) {
        const e: Effect<any> = current;

        try {
            switch (e.type) {
                case 'SucceedEffect': {
                    const succeedEffect = e as SucceedEffect<any>;
                    const next = nextSuccess(stack);
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
                    const next = nextSuccess(stack);
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

                    asyncEffect.completable((result: Either<Error, A>) => {
                        fold(result)(
                            a => {
                                const next = nextSuccess(stack);
                                if (next) {
                                    // ugh...
                                    run(next.f(a) as Effect<A>)(complete, stack);
                                } else {
                                    complete(right(a));
                                }
                            },
                            err => {
                                const next = nextFailure(stack);
                                if (next) {
                                    // ugh...
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
                    stack.push(successContinuation(flatMapEffect.f));

                    break;
                }
                case 'FailEffect': {
                    const failEffect = e as FailEffect<any>;
                    const next = nextFailure(stack);
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
                    stack.push(failureContinuation(recoverEffect.r));

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

const fromPromise = <A>(lazy: () => Promise<A>): Effect<A> => async((complete: Complete<A>) =>
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

// TODO - this requires all effects to have the same type. We can do what Promise does and define an `all` function for each array length
const all = <A>(arr: Effect<A>[]): Effect<A[]> => async((completeAll: Complete<A[]>) => {
    let hasFailed = false;
    const buffer: A[] = [];
    arr.forEach(e => e.run(result => fold(result)(
        a => {
            if (!hasFailed) {
                buffer.push(a);
                if (buffer.length === arr.length) completeAll(right(buffer));
            }
        },
        err => {
            // TODO - support interrupts?
            hasFailed = true;
            completeAll(left(err));
        }
    )))
});

export {
    succeed,
    flatMap,
    async,
    sync,
    fail,
    recover,
    run,
    fromPromise,
    manage,
    all
}