export interface Effect<A> {
    run: () => Promise<A>;
    map: <B>(f: (a: A) => B) => Effect<B>;
    flatMap: <B>(f: (a: A) => Effect<B>) => Effect<B>;
    flatMapP: <B>(f: (a: A) => Promise<B>) => Effect<B>;
    ensuring: (f: (a: A) => Error | null) => Effect<A>;
    // TODO - thread dependency through
    // TODO - arrays
}

const fromPromise = <A>(p: () => Promise<A>): Effect<A> => ({
    run: p,
    map: <B>(f: (a: A) => B): Effect<B> => fromPromise(() => p().then(f)),
    flatMap: <B>(f: (a: A) => Effect<B>): Effect<B> => fromPromise(() => p().then(a => f(a).run())),
    flatMapP: <B>(f: (a: A) => Promise<B>): Effect<B> => fromPromise(() => p().then(a => f(a))),
    ensuring: (f: (a: A) => Error | null): Effect<A> => fromPromise(() => p().then(a => {
        const e = f(a);
        return e === null ? Promise.resolve(a) : Promise.reject(e);
    })),
});

// TODO - what if p() throws? Where do we catch? Immediately, or in run()?
const pure = <A>(p: () => A): Effect<A> => ({
    run: () => Promise.resolve(p()),
    map: <B>(f: (a: A) => B): Effect<B> => pure(() => f(p())),
    flatMap: <B>(f: (a: A) => Effect<B>): Effect<B> => f(p()),
    flatMapP: <B>(f: (a: A) => Promise<B>): Effect<B> => fromPromise(() => f(p())),
    ensuring: (f: (a: A) => Error | null): Effect<A> => {
        const a = p();
        const e = f(a);
        return e === null ? value(a) : failure(e);
    },
});

const value = <A>(a: A): Effect<A> => pure(() => a);

const failure = <A>(error: Error): Effect<A> => fromPromise(() => Promise.reject(error));
const failureS = <A>(error: string): Effect<A> => failure<A>(new Error(error));

export default {
    promise: fromPromise,
    pure,
    value,
    failure,
    failureS,
};
