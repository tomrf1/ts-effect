import * as E from '../src/api';
import {Effect} from "../src/effect";

/**
 * Prove that the implementation is stack-safe by composing many Effects.
 *
 * The two examples behave differently here:
 * With Promises, calling `then` puts its callback onto the event loop, meaning we do not block while we count to 10000.
 * With Effect however, it blocks until 10000 is reached because `map` does not go to the event loop.
 * We could instead use flatMapP to avoid blocking.
 */

const incrementPromise = (p: Promise<number>): Promise<number> => p.then(n => n+1);

export const withoutEffect = (): Promise<number> => {
    let p = Promise.resolve(0);
    for (let i = 0; i < 10000; i++) {
        p = incrementPromise(p);
    }
    return p;
};

const incrementEffect = (e: Effect<number>): Effect<number> => e.map(n => n+1);

export const withEffect = (): Promise<number> => {
    let e: Effect<number> = E.succeed(0);
    for (let i = 0; i < 10000; i++) {
        e = incrementEffect(e);
    }
    return e.runP();
};

const runExample = (f: () => Promise<number>, name: string) => f()
    .then(r => console.log(`stackSafety ${name} success: ${JSON.stringify(r)}`))
    .catch(err => console.log(`stackSafety ${name} failed: ${err}`));

export default {
    without: () => runExample(withoutEffect, 'withoutEffect'),
    with: () => runExample(withEffect, 'withEffect')
}
