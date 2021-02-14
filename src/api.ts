import {Either, fold, failure, success} from './either';
import {Completable, Complete, Effect} from "./effect";

// An Effect that cannot fail
const succeed = <A>(a: A): SucceedEffect<A> => new SucceedEffect<A>(a);
export class SucceedEffect<A> extends Effect<never,A> {
    value: A;
    constructor(a: A) {
        super('SucceedEffect');
        this.value = a;
    }
}

const flatMap = <E,A,B>(effect: Effect<E,A>, f: (a: A) => Effect<E,B>): FlatMapEffect<E,A,B> => new FlatMapEffect<E,A,B>(effect, f);
export class FlatMapEffect<E,A,B> extends Effect<E,B> {
    effect: Effect<E,A>;
    f: (a: A) => Effect<E,B>;

    constructor(e: Effect<E,A>, f: (a: A) => Effect<E,B>) {
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

// Construct an Effect from a function that may throw an exception.
// If an exception is thrown when the Effect is run then the Effect will fail with the exception value (of type `unknown`).
// `mapError` can then be used to narrow the error type.
const sync = <A>(f: () => A): SyncEffect<A> => new SyncEffect<A>(f);
export class SyncEffect<A> extends Effect<unknown,A> {
    f: () => A;

    constructor(f: () => A) {
        super('SyncEffect');
        this.f = f;
    }
}

const fail = <E>(error: E): FailEffect<E> => new FailEffect<E>(error);
export class FailEffect<E> extends Effect<E,never> {
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

/**
 * Create an AsyncEffect from a Promise.
 * We cannot know the type of a Promise rejection value, so a mapError can be used to narrow the error type, e.g.:
 *   `asyncP(() => fetch(url)).mapError(err => ...)`
 */
const asyncP = <A>(lazy: () => Promise<A>): Effect<unknown,A> => async((complete: Complete<unknown,A>) =>
    lazy()
        .then(a => complete(success(a)))
        .catch(err => failure(err))
);

const fromEither = <E,A>(e: Either<E,A>): Effect<E,A> => fold<E,A,Effect<E,A>>(e)(
    a => succeed(a),
    e => fail<E>(e)
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
function chain<E,A,B,C,D,EE,F>(ea: Effect<E,A>, fs: [(a: A) => Effect<E,B>, (b: B) => Effect<E,C>, (c: C) => Effect<E,D>, (d: D) => Effect<E,EE>, (e: EE) => Effect<E,F>]): Effect<E,F>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 *   `allG<never,[Effect<never,number>,Effect<never,string>]>([E.succeed(1), E.succeed('a')]).map(([n,s]) => ...)`
 *
 * TODO - should error type also be heterogeneous?
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const allG = <E,T extends Effect<E,any>[]>(
    arr: T
): Effect<E,ExtractType<E,T>> => {
    return async((completeAll: Complete<E,ExtractType<E,T>>) => {
        let hasFailed = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const buffer: any[] = [];
        arr.forEach(e => e.run(result => fold(result)(
            a => {
                if (!hasFailed) {
                    buffer.push(a);
                    if (buffer.length === arr.length) completeAll(success(buffer as ExtractType<E,T>));
                }
            },
            err => {
                // TODO - support interrupts?
                hasFailed = true;
                completeAll(failure(err));
            }
        )))
    });
};

const all = <E,A>(arr: Effect<E,A>[]): Effect<E,A[]> => allG(arr);

export {
    succeed,
    flatMap,
    async,
    sync,
    fail,
    recover,
    asyncP,
    fromEither,
    manage,
    all,
    allG,
    chain
}
