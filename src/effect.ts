import {Either, fold, left, right} from './either';
import {
    async,
    fail,
    flatMap,
    FlatMapEffect,
    recover,
    RecoverEffect,
    run,
    succeedFull
} from "./api";
import {ContinuationStack} from "./continuationStack";

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
 * Models an effectful program.
 * Effects can be composed using the methods on this class
 */
export abstract class Effect<E,A> {
    type: EffectType;

    constructor(type: EffectType) {
        this.type = type;
    }

    // Run the Effect with the given completion callback. Catches exceptions
    run(complete: Complete<E,A>): void {
        run(this)(complete, new ContinuationStack<E,A>())
    }

    // Run the Effect as a Promise
    runP(): Promise<A> {
        return new Promise((resolve, reject) => {
            const complete = (result: Either<E, A>) => fold(result)(
                a => resolve(a),
                err => reject(err)
            );
            run(this)(complete, new ContinuationStack<E,A>());
        });
    }

    // Apply f to the result of the Effect
    map<B>(f: (a: A) => B): FlatMapEffect<E,E,A,B> {
        return flatMap(this, (a: A) => succeedFull<E,B>(f(a)))
    }

    // Apply f to the result of the Effect and flatten the nested Effects
    flatMap<B>(f: (a: A) => Effect<E,B>): FlatMapEffect<E,E,A,B> {
        return flatMap(this, f);
    }

    // Convenient alternative to flatMap for when f returns a promise
    flatMapP<B>(f: (a: A) => Promise<B>): FlatMapEffect<E,E,A,B> {
        const continuation = (a: A) => async<E,B>(complete =>
            f(a)
                .then(b => complete(right(b)))
                .catch(err => complete(left(err)))
        );

        return flatMap(this, continuation)
    }

    // Like flatMap, but combines the two Effect results into a tuple
    flatZip<B>(f: (a: A) => Effect<E,B>): FlatMapEffect<E,E,A, [A,B]> {
        return flatMap<E,E,A, [A,B]>(this, (a: A) =>
            f(a).map(b => ([a,b]))
        )
    }

    // Like flatMap, but combines the two Effect results using the given function
    flatZipWith<B,Z>(f: (a: A) => Effect<E,B>, z: (a: A, b: B) => Z): FlatMapEffect<E,E,A,Z> {
        return flatMap<E,E,A, Z>(this, (a: A) =>
            f(a).map(b => z(a,b))
        )
    }

    // Like flatMapP, but combines the two Effect results into a tuple
    flatZipP<B>(f: (a: A) => Promise<B>): FlatMapEffect<E,E,A, [A,B]> {
        const continuation = (a: A) => async<E,[A,B]>(complete =>
            f(a)
                .then(b => complete(right([a,b])))
                .catch(err => complete(left(err)))
        );

        return flatMap(this, continuation)
    }

    // Like flatMapP, but combines the two Effect results using the given function
    flatZipWithP<B,Z>(f: (a: A) => Promise<B>, z: (a: A, b: B) => Z): FlatMapEffect<E,E,A, Z> {
        const continuation = (a: A) => async<E,Z>(complete =>
            f(a)
                .then(b => complete(right(z(a,b))))
                .catch(err => complete(left(err)))
        );

        return flatMap(this, continuation)
    }

    // Apply predicate to the result of the Effect and either produce an error using e, or leave the value unchanged
    filter(p: (a: A) => boolean, e: (a: A) => E): FlatMapEffect<E,E,A,A> {
        return flatMap(this, (a: A) => {
            if (p(a)) return succeedFull(a);
            else return fail(e(a));
        })
    }

    // Apply f to the result of the Effect and either produce an error or a value of type B
    validate<E2,B>(f: (a: A) => Either<E2,B>): FlatMapEffect<E,E2,A,B> {
        return flatMap(this, (a: A) =>
            fold<E2,B,Effect<E2,B>>(f(a))(
                b => succeedFull(b),
                err => fail(err)
            )
        );
    }

    // If the Effect fails then apply f to the error to produce a new error
    mapError<E2>(f: (e: E) => E2): RecoverEffect<E,E2,A> {
        return recover(this, e => fail(f(e)));
    }

    // If the Effect fails then apply f to the error to produce a value of type A
    recover(f: (e: E) => A): RecoverEffect<E,E,A> {
        return recover(this, e => succeedFull(f(e)));
    }

    // If the Effect fails then apply f to the error to produce an Effect of type A
    recoverWith<E2>(f: (e: E) => Effect<E2,A>): RecoverEffect<E,E2,A> {
        return recover(this, f);
    }
}
