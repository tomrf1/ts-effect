import * as E from '../src/api';
import {failure, success} from "../src/either";
import {Effect} from "../src/effect";
import * as fs from 'fs';

interface Model {
    a: string,
    b: number,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateData = (data: any): data is Model => typeof data === 'object' && typeof data.a === 'string' && typeof data.b === 'number';

/**
 *  A very convoluted way to read from a file - manually opening and closing it
 */

const IOWithoutEffect = {
    openFile: (path: string): Promise<number> => new Promise<number>((resolve, reject) =>
        fs.open(path, 'r', (err: Error | null, fd: number) => {
            if (err) reject(err);
            else resolve(fd);
        })
    ),

    readToString: (fd: number): Promise<string> => {
        const buffer = Buffer.alloc(512);
        return new Promise<string>((resolve, reject) =>
            fs.read(fd, buffer, 0, 512, 0, (err: Error | null, bytesRead: number) => {
                if (err) reject(err);
                else resolve(buffer.toString('utf-8', 0, bytesRead))
            })
        );
    },

    closeFile: (fd: number): void => fs.close(fd, () => {console.log(`closed ${fd}`)}),
};

const IOWithEffect = {
    openFile: (path: string): Effect<Error,number> => E.async(complete =>
        fs.open(path, 'r', (err: Error | null, fd: number) => {
            if (err) complete(failure(err));
            else complete(success(fd));
        })
    ),

    readToString: (fd: number): Effect<Error,string> => {
        const buffer = Buffer.alloc(512);
        return E.async(complete => {
            fs.read(fd, buffer, 0, 512, 0, (err: Error | null, bytesRead: number) => {
                if (err) complete(failure(err));
                else complete(success(buffer.toString('utf-8', 0, bytesRead)))
            })
        })
    },

    closeFile: (fd: number): void => fs.close(fd, () => {console.log(`closed ${fd}`)}),
};

const withoutEffect = (path: string): Promise<Model> =>
    IOWithoutEffect.openFile(path).then(fd =>
        IOWithoutEffect.readToString(fd)
            .finally(() => IOWithoutEffect.closeFile(fd))
    )
        .then((raw: string) => JSON.parse(raw))
        .then((json: unknown) => {
            if (validateData(json)) return Promise.resolve(json);
            else return Promise.reject(`Failed to parse: ${json}`);
        });

const parseJson = (raw: string): Effect<Error, unknown> => E
    .sync(() => JSON.parse(raw))
    .mapError(err => Error(`Failed to parse: ${err}`));

const withEffect = (path: string): Promise<Model> =>
    E.manage<Error,number,string>(
        IOWithEffect.openFile(path),
        IOWithEffect.closeFile,
        IOWithEffect.readToString
    )
        .flatMap(parseJson)
        .validate<Model>((json: unknown) => validateData(json) ?
            success(json) :
            failure(Error(`Failed to validate: ${json}`))
        )
        .runP();

const runExample = (f: (path: string) => Promise<Model>, name: string) =>
    f('./examples/example-data.json')
        .then(r => console.log(`fileIO ${name} success: ${JSON.stringify(r)}`))
        .catch(err => console.log(`fileIO ${name} failed: ${err}`));

export default {
    without: () => runExample(withoutEffect, 'withoutEffect'),
    with: () => runExample(withEffect, 'withEffect'),
}