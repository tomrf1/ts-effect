import * as E from '../src/api';
import {left, right} from '../src/either';

class Response {
    status: number;
    body: string;
    constructor(status: number, body: string) {
        this.status = status;
        this.body = body;
    }
    json(): Promise<any> {
        return Promise.resolve(JSON.parse(this.body))
    }
}

const makeRequest = (n: number): Promise<Response> => Promise.resolve(new Response(200, '{"x": "hello"}'));

const ServerError = new Response(500, 'Internal server error');
const InvalidRequest = new Response(400, 'Invalid request');

const withoutEffect = (body: string): Promise<Response> => {
    const n = parseInt(body);
    if (isNaN(n)) {
        return Promise.resolve(InvalidRequest);
    }

    return makeRequest(n)
        .then(resp => resp.status !== 200 ?
            Promise.reject(Error(`Wrong status: ${resp.status}`)) :
            resp
        )
        .then(resp => resp.json())
        .then(json => typeof json.x === 'string' ?
            new Response(200, `it says ${json.x}`) :
            ServerError
        )
        .catch(err => {
            console.error(`Failed with: ${err.message}`);
            return ServerError;
        });
};

const error = (name: string, message: string): Error => ({message, name});

const withEffect = (body: string): Promise<Response> =>
    E.succeed(parseInt(body))
        .filter(n => !isNaN(n), n => error('NAN', `${n} is NaN`))
        .flatMapP(makeRequest)
        .filter(
            resp => resp.status === 200,
            resp => error('BAD_RESPONSE', `Wrong status: ${resp.status}`)
        )
        .flatMapP(resp => resp.json())
        .validate<Response>(json => typeof json.x === 'string' ?
            right(new Response(200, `it says ${json.x}`)) :
            left(error('INVALID_DATA', 'Failed to parse data'))
        )
        .recover(err => {
            console.error(`Failed with: ${err.message}`);
            return err.name === 'NAN' ? InvalidRequest : ServerError;
        })
        .runP();

const runExample = (f: (body: string) => Promise<Response>, name: string) => f('1')
    .then(result => {
        console.log(`http ${name} success: ${JSON.stringify(result)}`);
        return result;
    });

export default {
    without: () => runExample(withoutEffect, 'withoutEffect'),
    with: () => runExample(withEffect, 'withEffect')
}
