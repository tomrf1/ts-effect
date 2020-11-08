import {Either, fold, left, right} from './either';
import {
    async,
    fail,
    flatMap,
    FlatMapEffect,
    recover,
    RecoverEffect,
    run,
    succeed
} from "./api";

// The callback type for reporting the result of an Effect
export type Complete<A> = (result: Either<Error,A>) => void;
// An Effectful function that passes its result to a callback
export type Completable<A> = (c: Complete<A>) => void;

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

export abstract class Effect<A> {
    type: EffectType;

    constructor(type: EffectType) {
        this.type = type;
    }

    // Run the Effect with the given completion callback. Catches exceptions
    run(complete: Complete<A>): void {
        run(this)(complete, [])
    }

    // Run the Effect as a Promise
    runP(): Promise<A> {
        return new Promise((resolve, reject) => {
            run(this)(result => fold(result)(
                a => resolve(a),
                err => reject(err)
            ), []);
        });
    }

    // Apply f to the result of the Effect
    map<B>(f: (a: A) => B): FlatMapEffect<A,B> {
        return flatMap(this, (a: A) => succeed<B>(f(a)))
    }

    // Apply f to the result of the Effect and flatten the nested Effects
    flatMap<B>(f: (a: A) => Effect<B>): FlatMapEffect<A,B> {
        return flatMap(this, f);
    }

    // Convenient alternative to flatMap for when f returns a promise
    flatMapP<B>(f: (a: A) => Promise<B>): FlatMapEffect<A,B> {
        const continuation = (a: A) => async<B>(complete =>
            f(a)
                .then(b => complete(right(b)))
                .catch(err => complete(left(err)))
        );

        return flatMap(this, continuation)
    }

    // Like flatMap, but combines the two Effects into a tuple
    flatZip<B>(f: (a: A) => Effect<B>): FlatMapEffect<A, [A,B]> {
        return flatMap<A, [A,B]>(this, (a: A) =>
            f(a).map(b => ([a,b]))
        )
    }

    // Like flatMap, but combines the two Effects using the given function
    flatZipWith<B,Z>(f: (a: A) => Effect<B>, z: (a: A, b: B) => Z): FlatMapEffect<A,Z> {
        return flatMap<A, Z>(this, (a: A) =>
            f(a).map(b => z(a,b))
        )
    }

    // Like flatMapP, but combines the two Effects into a tuple
    flatZipP<B>(f: (a: A) => Promise<B>): FlatMapEffect<A, [A,B]> {
        const continuation = (a: A) => async<[A,B]>(complete =>
            f(a)
                .then(b => complete(right([a,b])))
                .catch(err => complete(left(err)))
        );

        return flatMap(this, continuation)
    }

    // Like flatMapP, but combines the two Effects using the given function
    flatZipWithP<B,Z>(f: (a: A) => Promise<B>, z: (a: A, b: B) => Z): FlatMapEffect<A, Z> {
        const continuation = (a: A) => async<Z>(complete =>
            f(a)
                .then(b => complete(right(z(a,b))))
                .catch(err => complete(left(err)))
        );

        return flatMap(this, continuation)
    }

    // Apply predicate to the result of the Effect and either produce an error using e, or leave the value unchanged
    filter(p: (a: A) => boolean, e: (a: A) => Error): FlatMapEffect<A,A> {
        return flatMap(this, (a: A) => {
            if (p(a)) return succeed(a);
            else return fail(e(a));
        })
    }

    // Apply f to the result of the Effect and either produce an error or a value of type B
    validate<B>(f: (a: A) => Either<Error,B>): FlatMapEffect<A,B> {
        return flatMap(this, (a: A) =>
            fold<Error,B,Effect<B>>(f(a))(
                b => succeed(b),
                err => fail(err)
            )
        );
    }

    // If the Effect fails then apply f to the error to produce a new error
    mapError(f: (e: Error) => Error): RecoverEffect<A> {
        return recover(this, e => fail(f(e)));
    }

    // If the Effect fails then apply f to the error to produce a value of type A
    recover(f: (e: Error) => A): RecoverEffect<A> {
        return recover(this, e => succeed(f(e)));
    }

    // If the Effect fails then apply f to the error to produce an Effect of type A
    recoverWith(f: (e: Error) => Effect<A>): RecoverEffect<A> {
        return recover(this, f);
    }
}
