import * as E from '../src/api';
import {Effect} from "../src/effect";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {async, succeed} from "../src/api";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {success} from "../src/either";

/**
 * Prove that the implementation is stack-safe by composing many Effects.
 *
 * The two examples behave differently here:
 *
 * With Promises, calling `then` puts its callback onto the event loop, meaning we do not block while we count to 10000.
 *
 * With Effect however, it depends how we use it:
 * - if we use `map` or `flatMap` with a sync computation then it blocks until 10000 is reached because it does not go to the event loop.
 * - if we instead use flatMapP with a Promise then it does not block.
 * - if we use `flatMap` with an `AsyncEffect`, but the computation is in fact synchronous, then it blows up with a stack overflow.
 */

const incrementPromise = (p: Promise<number>): Promise<number> => p.then(n => n+1);

export const withoutEffect = (): Promise<number> => {
    let p = Promise.resolve(0);
    for (let i = 0; i < 10000; i++) {
        p = incrementPromise(p);
    }
    return p;
};

// Is stack-safe:
const incrementEffect = (e: Effect<never,number>): Effect<never,number> => e.flatMap(n => succeed(n+1));
// Is stack-safe:
// const incrementEffect = (e: Effect<any,number>): Effect<any,number> => e.flatMapP(n => Promise.resolve(n+1), err => err);
// Is not stack-safe:
// const incrementEffect = (e: Effect<never,number>): Effect<never,number> => e.flatMap(n => async(c => c(success(n+1))));

export const withEffect = (): Promise<number> => {
    let e: Effect<never,number> = E.succeed(0);
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
