import {pure} from "../src/api";
import {Effect} from "../src/effect";


/**
 * Here we compose many Completables.
 * When run is called, it stack overflows before anything is logged.
 * Promise does not have this issue, presumably because `then` puts its callback onto the event loop.
 *
 * We could build up an array of Effects to be run in a loop.
 * This means redefining Completable, as we need to avoid callbacks in sync operations.
 * Perhaps Effect can take a sync or async op, e.g. Completable<A> | () => A
 */

const incrementPromise = (p: Promise<number>): Promise<number> => p.then(n => {
    console.log(n);
    return n+1
});

export const withoutEffect = () => {
    let p = Promise.resolve(0);
    for (let i = 0; i < 10000; i++) {
        p = incrementPromise(p);
    }
};

const incrementEffect = (e: Effect<number>): Effect<number> => e.map(n => {
    console.log(n);
    return n+1
});

export const withEffect = () => {
    let e = pure(0);
    for (let i = 0; i < 10000; i++) {
        e = incrementEffect(e);
    }
    e.run(r => console.log(r.value));
};

export default {
    without: withoutEffect,
    with: withEffect
}
