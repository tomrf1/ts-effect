### ts-effect

An experiment to see if I can improve on `Promise` + `await` for async tasks and error handling.

I'm not convinced I've achieved this.

The `Effect` type (inspired by certain Scala libraries) lets us handle async computations as values, and chain operations.

E.g.

```typescript
import * as E from 'ts-effect/src/api';
import {Effect} from "ts-effect/src/effect";
import {fold, left, right} from "ts-effect/src/either";

interface MyData {x: number}

type ErrorType = 'FETCH_ERROR' | 'PARSE_ERROR' | 'BAD_STATUS' | 'BAD_DATA';
interface FetchError {
    type: ErrorType;
    info: string;
}
const error = (type: ErrorType, info: string): FetchError => ({type, info});

const fetchData = (url: string): Effect<FetchError,MyData> =>
    E.asyncP(() => fetch(url))
        .mapError<FetchError>((err: unknown) => error('FETCH_ERROR',`${err}`))
        .filter(
            resp => resp.status === 200, 
            resp => error('BAD_STATUS',`${resp.status}`))
        .flatMapP(
            resp => resp.json(), 
            err => error('PARSE_ERROR',`${err}`))
        .validate<MyData>(json => typeof json.x === 'number' ?
            right(json) :
            left(error('BAD_DATA', JSON.stringify(json)))
        );

fetchData(url).run(result => fold(result)(
    data => ... ,
    err => ...
));
```
