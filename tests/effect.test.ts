import * as E from '../src/api';
import {Effect} from '../src/effect';
import {left, right} from "../src/Either";

describe('Effect', () => {
    const effect: Effect<number> = E.pure(1);

    const err = new Error('failed1');
    const fails: Effect<number> = E.failure<number>(err);

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
        const p = effect.flatMap(x => E.pure(x * 2)).runP();
        await expect(p).resolves.toEqual(2);
    });

    it('flatMap with failure', async () => {
        const p = effect.flatMap(x => {throw err}).runP();
        await expect(p).rejects.toBe(err);
    });

    it('flatMapP', async () => {
        const p = effect.flatMapP(x => Promise.resolve(x*2)).runP();
        await expect(p).resolves.toEqual(2);
    });

    it('flatZip', async () => {
        const p = effect.flatZip(x => E.pure(x*2)).runP();
        await expect(p).resolves.toEqual([1,2]);
    });

    it('flatZipWith', async () => {
        const p = effect.flatZipWith(x => E.pure(x*2), (x, y) => ({x,y})).runP();
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
        const p = fails.recoverWith(e => E.pure(2)).runP();
        await expect(p).resolves.toEqual(2);
    });

    it('all', async () => {
        const p = E.all([1,2].map(x => E.pure(x*2)))
            .map((arr: number[]) => arr.reduce((x,y) => x+y))
            .runP();

        await expect(p).resolves.toEqual(6);
    });

    it('all with fail', async () => {
        const p = E.all([effect, fails])
            .map((arr: number[]) => arr.reduce((x,y) => x+y))
            .runP();

        await expect(p).rejects.toBe(err);
    });

    it('manage success', async () => {
        const acquire: Effect<number> = E.pure(1);
        const release = jest.fn().mockImplementation(() => { console.log('release') });

        const generator = jest.fn().mockImplementation((a: number): Effect<string> => E.pure(`${a}`));

        const p = E.manage<number,string>(acquire, release, generator).runP();

        await expect(p).resolves.toEqual('1');
        expect(release).toHaveBeenCalledTimes(1);
        expect(generator.mock.invocationCallOrder[0]).toBeLessThan(release.mock.invocationCallOrder[0])
    });

    it('manage failure in effect generator', async () => {
        const acquire: Effect<number> = E.pure(1);
        const release = jest.fn().mockImplementation(() => { console.log('release') });

        const p = E.manage<number,string>(acquire,release, a => { throw err }).runP();

        await expect(p).rejects.toBe(err);
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('manage failure in effect', async () => {
        const acquire: Effect<number> = E.pure(1);
        const release = jest.fn().mockImplementation(() => { console.log('release') });

        const p = E.manage<number,number>(acquire,release, a => fails).runP();

        await expect(p).rejects.toBe(err);
        expect(release).toHaveBeenCalledTimes(1);
    });
});
