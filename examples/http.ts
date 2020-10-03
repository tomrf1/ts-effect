import * as E from '../src/api';

interface Response {
    status: number,
    body: string,
}

const makeRequest = (n: number): Promise<Response> => Promise.resolve({ status: 200, body: 'ok' });
const changeResponseBody = (body: string) => (response: Response): Response => ({...response, body});

const withoutEffect = (s: string): Promise<Response> => {
    const n = parseInt(s);
    if (isNaN(n)) {
        return Promise.reject(Error('is NaN'));
    }

    return makeRequest(n)
        .then(response => {
            if (response.status !== 200) {
                return Promise.reject(Error(`Wrong status: ${response.status}`));
            } else {
                return changeResponseBody('really ok')(response);
            }
        })
};

const withEffect = (s: string): Promise<Response> =>
    E.pure(parseInt(s))
        .filter(n => !isNaN(n), n => Error('is NaN'))
        .flatMapP(makeRequest)
        .filter(resp => resp.status === 200,resp => Error(`Wrong status: ${resp.status}`))
        .map(changeResponseBody('really ok'))
        .runP();

const runExample = (f: (s: string) => Promise<Response>, name: string) => f('1')
    .catch(err => {
        console.log(`http ${name} failed: ${err}`);
        return { status: 500, body: 'not ok'};
    })
    .then(result => {
        console.log(`http ${name} success: ${JSON.stringify(result)}`);
        return result;
    });

export default {
    without: () => runExample(withoutEffect, 'withoutEffect'),
    with: () => runExample(withEffect, 'withEffect')
}
