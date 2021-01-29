import * as E from '../src/api';
import {Effect} from '../src/effect';
import {left, right} from "../src/Either";

describe('Effect', () => {
    const effect: Effect<void,number> = E.succeed(1);

    const err = new Error('failed1');
    const fails: Effect<Error,number> = E.fail(err);

    it('run', () => {
        const complete = jest.fn();
        effect.run(complete);
        expect(complete).toBeCalledWith(right(1));
    });

    it('runP', async () => {
        const p = effect.runP();
        await expect(p).resolves.toEqual(1);
    });

    it('map', async () => {
        const p = effect.map(x => x * 2).runP();
        await expect(p).resolves.toEqual(2);
    });

    it('flatMap', async () => {
        const p = effect.flatMap(x => E.succeed(x * 2)).runP();
        await expect(p).resolves.toEqual(2);
    });

    it('flatMap with failure (run)', async () => {
        const complete = jest.fn();
        effect.flatMap<number>(x => {throw err}).map(n => n *2).run(complete);
        expect(complete).toBeCalledWith(left(err));
    });

    it('flatMap with failure (runP)', async () => {
        const p = effect.flatMap<number>(x => {throw err}).map(n => n *2).runP();
        await expect(p).rejects.toBe(err);
    });

    it('flatMapP', async () => {
        const p = effect.flatMapP(x => Promise.resolve(x*2)).runP();
        await expect(p).resolves.toEqual(2);
    });

    it('flatZip', async () => {
        const p = effect.flatZip(x => E.succeed(x*2)).runP();
        await expect(p).resolves.toEqual([1,2]);
    });

    it('flatZipWith', async () => {
        const p = effect.flatZipWith(x => E.succeed(x*2), (x, y) => ({x,y})).runP();
        await expect(p).resolves.toEqual({x: 1, y: 2});
    });

    it('flatZipP', async () => {
        const p = effect.flatZipP(x => Promise.resolve(x*2)).runP();
        await expect(p).resolves.toEqual([1,2]);
    });

    it('flatZipWithP', async () => {
        const p = effect.flatZipWithP(x => Promise.resolve(x*2), (x,y) => ({x,y})).runP();
        await expect(p).resolves.toEqual({x: 1, y: 2});
    });

    it('filter pass', async () => {
        const p = effect.filter(x => true, x => err).runP();
        await expect(p).resolves.toEqual(1);
    });

    it('filter fail', async () => {
        expect.assertions(1);
        const p = effect.filter(x => false, x => err).runP();
        await expect(p).rejects.toBe(err);
    });

    it('validate pass', async () => {
        const p = effect.validate(x => right(`${x}`)).runP();
        await expect(p).resolves.toEqual('1');
    });

    it('validate fail', async () => {
        expect.assertions(1);
        const p = effect.validate(x => left(err)).runP();
        await expect(p).rejects.toBe(err);
    });

    it('mapError', async () => {
        expect.assertions(1);
        const err2 = new Error('failed2');
        const p = fails.mapError(e => err2).runP();
        await expect(p).rejects.toBe(err2);
    });

    it('recover', async () => {
        expect.assertions(1);
        const p = fails.recover(e => 2).runP();
        await expect(p).resolves.toEqual(2);
    });

    it('recoverWith', async () => {
        expect.assertions(1);
        const p = fails.recoverWith(e => E.succeed(2)).runP();
        await expect(p).resolves.toEqual(2);
    });

    it('all', async () => {
        const p = E.all([1,2].map(x => E.succeed(x*2)))
            .map((arr: number[]) => arr.reduce((x,y) => x+y))
            .runP();

        await expect(p).resolves.toEqual(6);
    });

    it('all with fail', async () => {
        const p = E.all([E.succeedFull<Error,number>(1), fails])
            .map((arr: number[]) => arr.reduce((x,y) => x+y))
            .runP();

        await expect(p).rejects.toBe(err);
    });

    it('allG', async () => {
        const p = E.allG<void,[Effect<void,number>,Effect<void,string>]>([E.succeed(1), E.succeed('a')])
            .map(([n,s]: [number,string]) => `${n},${s}`)
            .runP();

        await expect(p).resolves.toEqual(`1,a`);
    });

    it('manage success', async () => {
        const acquire: Effect<void,number> = E.succeed(1);
        const release = jest.fn().mockImplementation(() => { console.log('release') });

        const generator = jest.fn().mockImplementation((a: number): Effect<void,string> => E.succeed(`${a}`));

        const p = E.manage<void,number,string>(acquire, release, generator).runP();

        await expect(p).resolves.toEqual('1');
        expect(release).toHaveBeenCalledTimes(1);
        expect(generator.mock.invocationCallOrder[0]).toBeLessThan(release.mock.invocationCallOrder[0])
    });

    it('manage failure in effect generator', async () => {
        const acquire: Effect<void,number> = E.succeed(1);
        const release = jest.fn().mockImplementation(() => { console.log('release') });

        const p = E.manage<void,number,string>(acquire,release, a => { throw err }).runP();

        await expect(p).rejects.toBe(err);
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('manage failure in effect', async () => {
        const acquire: Effect<Error,number> = E.succeedFull<Error,number>(1);
        const release = jest.fn().mockImplementation(() => { console.log('release') });

        const p = E.manage<Error,number,number>(acquire,release, a => fails).runP();

        await expect(p).rejects.toBe(err);
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('chain 1', async () => {
        const p: Promise<string> = E.chain(
            effect,
            [n => E.succeed(`${n}`)]
        ).runP();
        await expect(p).resolves.toBe('1');
    });

    it('chain 2', async () => {
        const p: Promise<boolean> = E.chain(
            effect,
            [n => E.succeed(`${n}`), s => E.succeed(true)]
        ).runP();
        await expect(p).resolves.toBe(true);
    });
});
