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

type ErrorType = 'NAN' | 'BAD_RESPONSE' | 'INVALID_DATA';

interface MyError {
    type: ErrorType;
    message: string;
}

const error = (type: ErrorType, message: string): MyError => ({type, message});

const withEffect = (body: string): Promise<Response> =>
    E.succeed<number>(parseInt(body))
        .filter(n => !isNaN(n), n => error('NAN', `${n} is NaN`))
        .flatMapP(makeRequest)
        .filter(
            resp => resp.status === 200,
            resp => error('BAD_RESPONSE', `Wrong status: ${resp.status}`)
        )
        .flatMapP(resp => resp.json())
        .validate<MyError,Response>(json => typeof json.x === 'string' ?
            right(new Response(200, `it says ${json.x}`)) :
            left(error('INVALID_DATA', 'Failed to parse data'))
        )
        .recover(err => {
            console.error(`Failed with: ${err.message}`);
            return err.type === 'NAN' ? InvalidRequest : ServerError;
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
