import * as E from '../src/api';
import {left, right} from "../src/either";
import {Effect} from "../src/effect";
const fs = require('fs');

interface Model {
    a: string,
    b: number,
}

const validateData = (data: any): data is Model => typeof data.a === 'string' && typeof data.b === 'number';

/**
 *  A very convoluted way to read from a file - manually opening and closing it
 */

const IOWithoutEffect = {
    openFile: (path: string): Promise<number> => new Promise<number>((resolve, reject) =>
        fs.open(path, 'r', (err: Error, fd: number) => {
            if (err) reject(err);
            else resolve(fd);
        })
    ),

    readToString: (fd: number): Promise<string> => {
        const buffer = Buffer.alloc(512);
        return new Promise<string>((resolve, reject) =>
            fs.read(fd, buffer, 0, 512, 0, (err: Error, bytesRead: number) => {
                if (err) reject(err);
                else resolve(buffer.toString('utf-8', 0, bytesRead))
            })
        );
    },

    closeFile: (fd: number): void => fs.close(fd, () => {console.log(`closed ${fd}`)}),
};

const IOWithEffect = {
    openFile: (path: string): Effect<Error,number> => E.async(complete =>
        fs.open(path, 'r', (err: Error, fd: number) => {
            if (err) complete(left(err));
            else complete(right(fd));
        })
    ),

    readToString: (fd: number): Effect<Error,string> => {
        const buffer = Buffer.alloc(512);
        return E.async(complete => {
            fs.read(fd, buffer, 0, 512, 0, (err: Error, bytesRead: number) => {
                if (err) complete(left(err));
                else complete(right(buffer.toString('utf-8', 0, bytesRead)))
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
        .then((json: any) => {
            if (validateData(json)) return Promise.resolve(json);
            else return Promise.reject(`Failed to parse: ${json}`);
        });

const withEffect = (path: string): Promise<Model> =>
    E.manage<Error,number,string>(
        IOWithEffect.openFile(path),
        IOWithEffect.closeFile,
        IOWithEffect.readToString
    )
        .map((raw: string) => JSON.parse(raw))
        .validate<Error,Model>((json: any) => validateData(json) ?
            right(json) :
            left(Error(`Failed to parse: ${json}`))
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