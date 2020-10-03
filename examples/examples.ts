import {Effect} from '..';
import E from '..';

interface Response {
    status: number,
    body: string,
}

const makeRequest = (n: number): Promise<Response> => Promise.resolve({ status: 200, body: 'ok' });
const changeResponseBody = (body: string) => (response: Response): Response => ({...response, body});

/**
 * Without Effect
 */
const normalExample = (s: string): Promise<Response> => {
    const n = parseInt(s);
    if (isNaN(n)) {
        return Promise.reject(new Error('is NaN'));
    }

    return makeRequest(n)
        .then(response => {
            if (response.status !== 200) {
                return Promise.reject(new Error(`Wrong status: ${response.status}`));
            } else {
                return changeResponseBody('really ok')(response);
            }
        })
};

const normalExampleResult: Promise<Response> = normalExample('1')
    .then(result => {
        console.log("normalExampleResult", result);
        return result;
    })
    .catch(err => {
        console.log('caught error', err);
        return { status: 500, body: 'not ok'};
    });

/**
 * With Effect
 */
const newExample = (s: string): Effect<Response> => E.value(s)
    .map(n => parseInt(n))
    .ensuring(n => isNaN(n) ? new Error('is NaN') : null)
    .flatMapP(makeRequest)
    // .map(r => {
    //     throw new Error('HERE')
    //     return r
    // })
    .ensuring(response => response.status === 200 ? null : new Error(`Wrong status: ${response.status}`))
    .map(changeResponseBody('really ok'));

const newExampleResult: Promise<Response> = newExample('1')
    .run()
    .then(result => {
        console.log("newExampleResult", result);
        return result;
    })
    .catch(err => {
        console.log('caught error', err);
        return { status: 500, body: 'not ok'};
    });
