import {Either} from './either';

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
