import {Either, fold, left, right} from './either';

// The callback type for reporting the result of an effect
export type Complete<A> = (result: Either<Error,A>) => void;
// An effectful function that passes its result to a callback
export type Completable<A> = (c: Complete<A>) => void;

export interface Effect<A> {
    // Run the effect with the given completion callback. Catches exceptions
    run: (complete: Complete<A>) => void;
    // Run the effect as a Promise
    runP: () => Promise<A>;

    // Apply f to the result of the effect
    map: <B>(f: (a: A) => B) => Effect<B>;
    // Apply f to the result of the effect and flatten the nested effects
    flatMap: <B>(f: (a: A) => Effect<B>) => Effect<B>;
    // Convenient alternative to flatMap for when f returns a promise
    flatMapP: <B>(f: (a: A) => Promise<B>) => Effect<B>;

    // Like flatMap, but combines the two effects into a tuple
    flatZip: <B>(f: (a: A) => Effect<B>) => Effect<[A,B]>;
    // Like flatMap, but combines the two effects using the given function
    flatZipWith: <B,Z>(f: (a: A) => Effect<B>, z: (a: A, b: B) => Z) => Effect<Z>;
    // Like flatMapP, but combines the two effects into a tuple
    flatZipP: <B>(f: (a: A) => Promise<B>) => Effect<[A,B]>;
    // Like flatMapP, but combines the two effects using the given function
    flatZipWithP: <B,Z>(f: (a: A) => Promise<B>, z: (a: A, b: B) => Z) => Effect<Z>;

    // Apply predicate to the result of the effect and either produce an error using e, or leave the value unchanged
    filter: (p: (a: A) => boolean, e: (a: A) => Error) => Effect<A>;
    // Apply f to the result of the effect and either produce an error or a value of type B
    validate: <B>(f: (a: A) => Either<Error,B>) => Effect<B>;

    // If the effect fails then apply f to the error to produce a new error
    mapError: (f: (e: Error) => Error) => Effect<A>;
    // If the effect fails then apply f to the error to produce a value of type A
    recover: (f: (e: Error) => A) => Effect<A>;
    // If the effect fails then apply f to the error to produce an Effect of type A
    recoverWith: (f: (e: Error) => Effect<A>) => Effect<A>;
}

type EffectType =
    'SucceedEffect' |
    'FlatMapEffect' |
    'AsyncEffect' |
    'SyncEffect' |
    'FailEffect' |
    'RecoverEffect';

/**
 * Models an effectful program.
 * Effects can be composed using the methods on this class
 */

export abstract class Effect2<A> {
    type: EffectType;
    constructor(type: EffectType) {
        this.type = type;
    }

    flatMap<B>(f: (a: A) => Effect2<B>): FlatMapEffect<A,B> {
        return flatMapEffect(this, f);
    }

    map<B>(f: (a: A) => B): FlatMapEffect<A,B> {
        return flatMapEffect(this, (a: A) => succeedEffect<B>(f(a)))
    }

    recoverWith(f: (e: Error) => Effect2<A>): RecoverEffect<A> {
        return recoverEffect(this, f);
    }

    recover(f: (e: Error) => A): RecoverEffect<A> {
        return recoverEffect(this, e => succeedEffect(f(e)));
    }
}

export const succeedEffect = <A>(a: A): SucceedEffect<A> => new SucceedEffect<A>(a);
export class SucceedEffect<A> extends Effect2<A> {
    value: A;
    constructor(a: A) {
        super('SucceedEffect');
        this.value = a;
    }
}

export const flatMapEffect = <A,B>(effect: Effect2<A>, f: (a: A) => Effect2<B>): FlatMapEffect<A,B> => new FlatMapEffect<A, B>(effect, f);
export class FlatMapEffect<A,B> extends Effect2<A> {
    effect: Effect2<A>;
    f: (a: A) => Effect2<B>;

    constructor(e: Effect2<A>, f: (a: A) => Effect2<B>) {
        super('FlatMapEffect');
        this.effect = e;
        this.f = f;
    }
}

export const asyncEffect = <A>(c: Completable<A>): AsyncEffect<A> => new AsyncEffect<A>(c);
export class AsyncEffect<A> extends Effect2<A> {
    completable: Completable<A>;

    constructor(c: Completable<A>) {
        super('AsyncEffect');
        this.completable = c;
    }
}

export const syncEffect = <A>(f: () => A): SyncEffect<A> => new SyncEffect<A>(f);
export class SyncEffect<A> extends Effect2<A> {
    f: () => A;

    constructor(f: () => A) {
        super('SyncEffect');
        this.f = f;
    }
}

export const failEffect = <A>(error: Error): FailEffect<A> => new FailEffect<A>(error);
export class FailEffect<A> extends Effect2<A> {
    error: Error;
    constructor(error: Error) {
        super('FailEffect');
        this.error = error;
    }
}

export const recoverEffect = <A>(effect: Effect2<A>, recover: (e: Error) => Effect2<A>): RecoverEffect<A> => new RecoverEffect<A>(effect, recover);
export class RecoverEffect<A> extends Effect2<A> {
    effect: Effect2<A>;
    r: (e: Error) => Effect2<A>;
    constructor(effect: Effect2<A>, recover: (e: Error) => Effect2<A>) {
        super('RecoverEffect');
        this.effect = effect;
        this.r = recover;
    }
}

// As composed Effects are interpreted they are added to a stack of Continuations, which includes any error handlers
interface Continuation<A,B> {
    type: 'Success' | 'Failure';
    f: (x: A) => Effect2<B>;
}
const successContinuation = <A,B>(f: (x: A) => Effect2<B>): Continuation<A,B> => ({type: 'Success', f});
const failureContinuation = <B>(f: (x: Error) => Effect2<B>): Continuation<Error,B> => ({type: 'Failure', f});

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
export const run = <A>(effect: Effect2<A>, complete: Complete<A>, stack: ContinuationStack = []): void => {
    console.log("run with ", stack.length)

    let current: Effect2<any> | null = effect;

    while (current !== null) {
        const e = current;

        switch (e.type) {
            case 'SucceedEffect': {
                const succeedEffect = e as SucceedEffect<any>;
                console.log("SucceedEffect", stack.length)
                const next = nextSuccess(stack);
                // console.log("SucceedEffect", succeedEffect.value, next)
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
                console.log("SyncEffect", stack.length)
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
                console.log("AsyncEffect", stack.length)
                
                asyncEffect.completable((result: Either<Error,A>) => {
                    fold(result)(
                        a => {
                            const next = nextSuccess(stack);
                            if (next) {
                                // ugh...
                                run(next.f(a) as Effect2<A>, complete, stack);
                            } else {
                                complete(right(a));
                            }
                        },
                        err => {
                            const next = nextFailure(stack);
                            if (next) {
                                // ugh...
                                run(next.f(err) as Effect2<A>, complete, stack);
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
                const flatMapEffect = e as FlatMapEffect<any,any>;
                current = flatMapEffect.effect;
                console.log("FlatMapEffect", stack.length)
                stack.push(successContinuation(flatMapEffect.f));

                break;
            }
            case 'FailEffect': {
                const failEffect = e as FailEffect<any>;
                console.log("FailEffect", stack.length)
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
                console.log("RecoverEffect", stack.length)
                stack.push(failureContinuation(recoverEffect.r));

                break;
            }
            default:
                console.log("unknown effect", e.type);
                current = null;
        }
    }
};
