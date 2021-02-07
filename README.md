### ts-effect

An experiment to see if I can improve on `Promise` + `await` for async tasks and error handling.

I'm not convinced I've achieved this.

The `Effect` type (inspired by certain Scala libraries) lets us handle async computations as values, and chain operations.
Error types are encoded in the `Effect` type, as an alternative to exceptions/rejections.

E.g.

```typescript
import * as E from 'ts-effect/src/api';
import {Effect} from "ts-effect/src/effect";
import {fold, failure, success} from "ts-effect/src/either";

type ErrorType = 'FETCH_ERROR' | 'PARSE_ERROR' | 'BAD_STATUS' | 'BAD_DATA';
interface FetchError {
    type: ErrorType;
    info: string;
}
const error = (type: ErrorType, info: string): FetchError => ({type, info});

const fetchData = (url: string): Effect<FetchError,number> =>
    E.asyncP(() => fetch(url))
        .mapError((err: unknown) => error('FETCH_ERROR',`${err}`))
        .filter(
            resp => resp.status === 200, 
            resp => error('BAD_STATUS',`${resp.status}`))
        .flatMapP(
            resp => resp.json(), 
            err => error('PARSE_ERROR',`${err}`))
        .validate<number>(json => typeof json.x === 'number' ?
            success(json.x) :
            failure(error('BAD_DATA', JSON.stringify(json)))
        );

fetchData(url).run(result => fold(result)(
    (data: number) => ... ,
    (err: FetchError) => ...
));
```
