interface Left<L> {
    type: 'left',
    value: L,
}
interface Right<R> {
    type: 'right',
    value: R,
}

export type Either<A,B> = Left<A> | Right<B>;

const left = <L,R>(l: L): Either<L,R> => ({ type: 'left', value: l });
const right = <L,R>(r: R): Either<L,R> => ({ type: 'right', value: r });

const map = <L,R,R2>(e: Either<L,R>) => (f: (r: R) => R2): Either<L,R2> =>
    e.type === 'right' ? right<L,R2>(f(e.value)) : e;
const flatMap = <L,R,R2>(e: Either<L,R>) => (f: (r: R) => Either<L,R2>): Either<L,R2> =>
    e.type === 'right' ? f(e.value) : e;
const fold = <L,R,A>(e: Either<L,R>) => (f: (r: R) => A, g: (l: L) => A): A =>
    e.type === 'left' ? g(e.value) : f(e.value);
const toEither = <L,R>(f: () => R): Either<L,R> => {
    try {
        return right(f());
    } catch (error) {
        return left(error);
    }
};

export {
    left,
    right,
    map,
    flatMap,
    fold,
    toEither,
};
