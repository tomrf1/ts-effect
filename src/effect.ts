import {Either, fold, failure, success} from './either';
import {
    async,
    fail,
    flatMap,
    recover,
    succeed,
} from "./api";
import {ContinuationStack} from "./continuationStack";
import {run} from "./run";

// The callback type for reporting the result of an Effect
export type Complete<E,A> = (result: Either<E,A>) => void;
// An Effectful function that passes its result to a callback
export type Completable<E,A> = (c: Complete<E,A>) => void;

type EffectType =
    'SucceedEffect' |
    'FlatMapEffect' |
    'AsyncEffect' |
    'SyncEffect' |
    'FailEffect' |
    'RecoverEffect';

/**
 * Models an effectful program that may succeed or fail.
 * A is the success value type.
 * E is the error value type.
 *
 * Effects can be composed using the methods on this class.
 *
 * When the Effect is run, exceptions are only caught where the SyncEffect type is used.
 * Promise.catch is called when flatMapP/flatZipP/flatZipWithP are used.
 */
export abstract class Effect<E,A> {
    type: EffectType;

    constructor(type: EffectType) {
        this.type = type;
    }

    // Run the Effect with the given completion callback. Exceptions are only caught inside `SyncEffect`.
    run(complete: Complete<E,A>): void {
        run(this)(complete, new ContinuationStack())
    }

    // Run the Effect as a Promise. If an exception is thrown while running the Effect then the Promise will reject
    runP(): Promise<A> {
        return new Promise((resolve, reject) => {
            const complete = (result: Either<E, A>) => fold(result)(
                a => resolve(a),
                err => reject(err)
            );
            run(this)(complete, new ContinuationStack());
        });
    }

    // Apply f to the result of the Effect
    map<B>(f: (a: A) => B): Effect<E,B> {
        return flatMap(this, (a: A) => succeed(f(a)))
    }

    // Apply f to the result of the Effect and flatten the nested Effects
    flatMap<B>(f: (a: A) => Effect<E,B>): Effect<E,B> {
        return flatMap(this, f);
    }

    // Convenient alternative to flatMap for when f returns a promise. To avoid unknown error types, Promise rejections must be handled by e
    flatMapP<B>(f: (a: A) => Promise<B>, e: (err: unknown) => E): Effect<E,B> {
        const continuation = (a: A) => async<E,B>(complete =>
            f(a)
                .then(b => complete(success(b)))
                .catch((err: unknown) => complete(failure(e(err))))
        );

        return flatMap(this, continuation)
    }

    // Like flatMap, but combines the two Effect results into a tuple
    flatZip<B>(f: (a: A) => Effect<E,B>): Effect<E,[A,B]> {
        return flatMap<E,A, [A,B]>(this, (a: A) =>
            f(a).map(b => ([a,b]))
        )
    }

    // Like flatMap, but combines the two Effect results using the given function
    flatZipWith<B,Z>(f: (a: A) => Effect<E,B>, z: (a: A, b: B) => Z): Effect<E,Z> {
        return flatMap<E,A, Z>(this, (a: A) =>
            f(a).map(b => z(a,b))
        )
    }

    // Like flatMapP, but combines the two Effect results into a tuple
    flatZipP<B>(f: (a: A) => Promise<B>, e: (err: unknown) => E): Effect<E,[A,B]> {
        const continuation = (a: A) => async<E,[A,B]>(complete =>
            f(a)
                .then(b => complete(success([a,b])))
                .catch((err: unknown) => complete(failure(e(err))))
        );

        return flatMap(this, continuation)
    }

    // Like flatMapP, but combines the two Effect results using the given function
    flatZipWithP<B,Z>(f: (a: A) => Promise<B>, z: (a: A, b: B) => Z, e: (err: unknown) => E): Effect<E,Z> {
        const continuation = (a: A) => async<E,Z>(complete =>
            f(a)
                .then(b => complete(success(z(a,b))))
                .catch((err: unknown) => complete(failure(e(err))))
        );

        return flatMap(this, continuation)
    }

    // Apply predicate to the result of the Effect and either produce an error using e, or leave the value unchanged
    filter(p: (a: A) => boolean, e: (a: A) => E): Effect<E,A> {
        return flatMap(this, (a: A) => {
            if (p(a)) return succeed(a);
            else return fail(e(a));
        })
    }

    // Apply f to the result of the Effect and either produce an error or a value of type B
    validate<B>(f: (a: A) => Either<E,B>): Effect<E,B> {
        return flatMap(this, (a: A) =>
            fold<E,B,Effect<E,B>>(f(a))(
                b => succeed(b),
                err => fail(err)
            )
        );
    }

    // If the Effect fails then apply f to the error to produce a new error
    mapError<E2>(f: (e: E) => E2): Effect<E2,A> {
        return recover(this, e => fail(f(e)));
    }

    // If the Effect fails then apply f to the error to produce a value of type A
    recover(f: (e: E) => A): Effect<E,A> {
        return recover(this, e => succeed(f(e)));
    }

    // If the Effect fails then apply f to the error to produce an Effect of type A
    recoverWith(f: (e: E) => Effect<E,A>): Effect<E,A> {
        return recover(this, f);
    }
}

// For when the type of the error is not known, or is not important to the rest of the program, e.g. just for logging
export type Task<A> = Effect<unknown,A>;
