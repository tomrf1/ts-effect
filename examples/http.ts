import * as E from '../src/api';
import {failure, success} from '../src/either';

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

const makeRequest = (n: number): Promise<Response> => n === 1 ?
    Promise.resolve(new Response(200, '{"x": "hello"}')) :
    Promise.resolve(new Response(400, 'No'));

const ServerError = new Response(500, 'Internal server error');
const InvalidRequest = new Response(400, 'Invalid request');

const withoutEffect = (body: string): Promise<Response> => {
    try {
        const json = JSON.parse(body);
        if (typeof json.n !== 'number') {
            return Promise.resolve(InvalidRequest);
        }

        return makeRequest(json.n)
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
    } catch (err) {
        return Promise.resolve(InvalidRequest);
    }
};

type ErrorType = 'BAD_REQUEST' | 'FETCH_ERROR' | 'BAD_RESPONSE';

interface MyError {
    type: ErrorType;
    message: string;
}

const error = (type: ErrorType, message: string): MyError => ({type, message});

const withEffect = (body: string): Promise<Response> =>
    E.unsafe(() => JSON.parse(body))
        .mapError(err => error('BAD_REQUEST', `${err}`))
        .validate<number>(json => typeof json.n === 'number' ?
            success(json.n) :
            failure(error('BAD_REQUEST', `${json}`))
        )
        .flatMapP(makeRequest, err => error('FETCH_ERROR', `${err}`))
        .filter(
            resp => resp.status === 200,
            resp => error('BAD_RESPONSE', `Wrong status: ${resp.status}`)
        )
        .flatMapP(resp => resp.json(), err => error('BAD_RESPONSE', `${err}`))
        .validate<Response>(json => typeof json.x === 'string' ?
            success(new Response(200, `it says ${json.x}`)) :
            failure(error('BAD_RESPONSE', 'Failed to parse data'))
        )
        .recover(err => {
            console.error(`Failed with ${err.type}: ${err.message}`);
            return err.type === 'BAD_REQUEST' ? InvalidRequest : ServerError;
        })
        .runP();

const runExample = (f: (body: string) => Promise<Response>, name: string) => f('{"n": 1}')
    .then(result => {
        console.log(`http ${name} success: ${JSON.stringify(result)}`);
        return result;
    });

export default {
    without: () => runExample(withoutEffect, 'withoutEffect'),
    with: () => runExample(withEffect, 'withEffect')
}
