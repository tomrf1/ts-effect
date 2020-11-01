import {Either} from './either';
import * as E from './either';
import {Effect, Completable, Complete} from "./effect";

// Creates a Complete<A> from the given success + failure handlers
const complete = <A>(onSuccess: (a: A) => void, onFailure: (err: Error) => void): Complete<A> => (result: Either<Error,A>) =>
    E.fold<Error,A,void>(result)(
        a => {
            try {
                onSuccess(a)
            } catch (err) {
                onFailure(err)
            }
        },
        err => onFailure(err)
    );

const run = <A>(c: Completable<A>) => (complete: Complete<A>): void => {
    try {
        c(complete);
    } catch (err) {
        complete(E.left(err));
    }
};

const runP = <A>(c: Completable<A>) => (): Promise<A> => new Promise((resolve, reject) => {
    c(complete<A>(
        a => resolve(a),
        err => reject(err)
    ));
});

const map = <A,B>(c: Completable<A>) => (f: (a: A) => B): Effect<B> => effect((completeB: Complete<B>) =>
    c(complete<A>(
        a => completeB(E.right(f(a))),
        err => completeB(E.left(err))
    ))
);

const flatMap = <A,B>(c: Completable<A>) => (f: (a: A) => Effect<B>): Effect<B> => effect((completeB: Complete<B>) =>
    c(complete<A>(
        a => f(a).run(completeB),
        err => completeB(E.left(err))
    ))
);

const flatMapP = <A,B>(c: Completable<A>) => (f: (a: A) => Promise<B>): Effect<B> => effect((completeB: Complete<B>) =>
    c(complete<A>(
        a => f(a)
            .then(b => completeB(E.right(b)))
            .catch(err => completeB(E.left(err))),
        err => completeB(E.left(err))
    ))
);

const flatZipWith = <A,B,Z>(c: Completable<A>) => (f: (a: A) => Effect<B>, z: (a: A, b: B) => Z): Effect<Z> => effect((completeZ: Complete<Z>) =>
    c(complete<A>(
        a => f(a)
            .map<Z>(b => z(a,b))
            .run(completeZ),
        err => completeZ(E.left(err))
    ))
);

const flatZip = <A,B>(c: Completable<A>) => (f: (a: A) => Effect<B>): Effect<[A,B]> => flatZipWith<A,B,[A,B]>(c)(f, (a, b) => ([a,b]));

const flatZipWithP = <A,B,Z>(c: Completable<A>) => (f: (a: A) => Promise<B>, z: (a: A, b: B) => Z): Effect<Z> => effect((completeZ: Complete<Z>) =>
    c(complete<A>(
        a => f(a)
            .then(b => completeZ(E.right(z(a,b)))),
        err => completeZ(E.left(err))
    ))
);

const flatZipP = <A,B>(c: Completable<A>) => (f: (a: A) => Promise<B>): Effect<[A,B]> => flatZipWithP<A,B,[A,B]>(c)(f, (a, b) => ([a,b]));

const filter = <A>(c: Completable<A>) => (p: (a: A) => boolean, e: (a: A) => Error): Effect<A> => effect((completeA: Complete<A>) =>
    c(complete<A>(
        a => p(a) ?
            completeA(E.right(a)) :
            completeA(E.left(e(a))
        ),
        err => completeA(E.left(err))
    ))
);

const validate = <A,B>(c: Completable<A>) => (f: (a: A) => Either<Error,B>): Effect<B> => effect((completeB: Complete<B>) =>
    c(complete<A>(
        a => E.fold(f(a))(
            b => completeB(E.right(b)),
            err => completeB(E.left(err))
        ),
        err => completeB(E.left((err)))
    ))
);

const mapError = <A>(c: Completable<A>) => (f: (e: Error) => Error): Effect<A> => effect((completeA: Complete<A>) =>
    c(complete<A>(
        a => completeA(E.right(a)),
        err => completeA(E.left(f(err)))
    ))
);

const recover = <A>(c: Completable<A>) =>  (f: (e: Error) => A): Effect<A> => effect((completeA: Complete<A>) =>
    c(complete<A>(
        a => completeA(E.right(a)),
        err => completeA(E.right(f(err)))
    ))
);

const recoverWith = <A>(c: Completable<A>) => (f: (e: Error) => Effect<A>): Effect<A> => effect((completeA: Complete<A>) =>
    c(complete<A>(
        a => completeA(E.right(a)),
        err => f(err).run(completeA)
    ))
);

const effect = <A>(f: Completable<A>): Effect<A> => ({
    run: run(f),
    runP: runP(f),
    map: map(f),
    flatMap: flatMap(f),
    flatMapP: flatMapP(f),
    flatZip: flatZip(f),
    flatZipWith: flatZipWith(f),
    flatZipP: flatZipP(f),
    flatZipWithP: flatZipWithP(f),
    filter: filter(f),
    validate: validate(f),
    mapError: mapError(f),
    recover: recover(f),
    recoverWith: recoverWith(f)
});

const fromPromise = <A>(lazy: () => Promise<A>): Effect<A> => effect((complete: Complete<A>) =>
    lazy()
        .then(a => complete(E.right(a)))
        .catch(err => E.left(err))
);

const failure = <A>(err: Error): Effect<A> => effect(c => c(E.left(err)));

const pure = <A>(a: A): Effect<A> => effect(c => c(E.right(a)));

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
            return failure(err);
        }
    });

// TODO - this requires all effects to have the same type. We can do what Promise does and define an `all` function for each array length
const all = <A>(arr: Effect<A>[]): Effect<A[]> => effect((completeAll: Complete<A[]>) => {
    let hasFailed = false;
    const buffer: A[] = [];
    arr.forEach(e => e.run(complete<A>(
        a => {
            if (!hasFailed) {
                buffer.push(a);
                if (buffer.length === arr.length) completeAll(E.right(buffer));
            }
        },
        err => {
            // TODO - support interrupts?
            hasFailed = true;
            completeAll(E.left(err));
        }
    )))
});

export {
    effect,
    fromPromise,
    pure,
    failure,
    manage,
    all,
}
