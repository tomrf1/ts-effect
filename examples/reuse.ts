import * as E from '../src/api';

/**
 * Example of re-using an earlier async result later on.
 * `await` is very useful in these cases.
 *
 * We can use Effect's flatZip functions to avoid nested flatMaps, but it's not as simple as `await`.
 */

type Result = {a: number, c: string};

const withoutEffect = async (): Promise<Result> => {
    const getDependencyA: Promise<number> = Promise.resolve(1);
    const getDependencyB = (n: number): Promise<number> => Promise.resolve(n + 1);
    const fetch = (n: number): Promise<string> => Promise.resolve(`${n}`);

    const a = await getDependencyA;
    const b = await getDependencyB(a);
    return fetch(b)
        .then(c => ({a,c}))
};

const withEffect = async (): Promise<Result> => {
    const getDependencyA = E.succeed(1);
    const getDependencyB = (n: number) => E.succeed(n + 1);
    const fetch = (n: number) => E.succeed(`${n}`);

    return getDependencyA
        .flatZip(getDependencyB)
        .flatZipWith(
            ([, b]) => fetch(b),
            ([a, ], c) => ({a, c})
        )
        .runP();
};

const runExample = (f: () => Promise<Result>, name: string) => f()
    .then(r => console.log(`reuse ${name} success: ${JSON.stringify(r)}`))
    .catch(err => console.log(`reuse ${name} failed: ${err}`));

export default {
    without: () => runExample(withoutEffect, 'withoutEffect'),
    with: () => runExample(withEffect, 'withEffect')
}
