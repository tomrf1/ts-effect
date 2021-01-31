interface Failure<L> {
    type: 'failure',
    value: L,
}
interface Success<R> {
    type: 'success',
    value: R,
}

export type Either<A,B> = Failure<A> | Success<B>;

const failure = <L,R>(l: L): Either<L,R> => ({ type: 'failure', value: l });
const success = <L,R>(r: R): Either<L,R> => ({ type: 'success', value: r });

const map = <L,R,R2>(e: Either<L,R>) => (f: (r: R) => R2): Either<L,R2> =>
    e.type === 'success' ? success<L,R2>(f(e.value)) : e;
const flatMap = <L,R,R2>(e: Either<L,R>) => (f: (r: R) => Either<L,R2>): Either<L,R2> =>
    e.type === 'success' ? f(e.value) : e;
const fold = <L,R,A>(e: Either<L,R>) => (f: (r: R) => A, g: (l: L) => A): A =>
    e.type === 'failure' ? g(e.value) : f(e.value);
const toEither = <R>(f: () => R): Either<unknown,R> => {
    try {
        return success(f());
    } catch (error) {
        return failure(error);
    }
};

export {
    failure,
    success,
    map,
    flatMap,
    fold,
    toEither,
};
