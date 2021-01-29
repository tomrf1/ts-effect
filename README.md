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
interface MyError {
    type: 'BAD_STATUS' | 'BAD_DATA';
    info: string;
}

const fetchData = (url: string): Effect<MyError,MyData> =>
    E.asyncP(() => fetch(url))
        .filter(resp => resp.status === 200, resp => ({type: 'BAD_STATUS', info: `${resp.status}`}))
        .flatMapP(resp => resp.json())
        .validate<MyError,MyData>(json => typeof json.x === 'number' ?
            right(json) :
            left({type: 'BAD_DATA', info: JSON.stringify(json)})
        );

fetchData(url).run(result => fold(result)(
    data => ... ,
    err => ...
));
```
