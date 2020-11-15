### ts-effect

An experiment to see if I can improve on `Promise` + `await` for async tasks and error handling.

I'm not convinced I've achieved this.

The `Effect` type (inspired by certain Scala libraries) lets us handle async computations as values, and chain operations.

E.g.

```
import * as E from '../src/api';
import {Effect} from "../src/effect";
import {fold, left, right} from "../src/either";

interface MyData {x: number}

const fetchData = (url: string): Effect<MyData> =>
    E.asyncP(() => fetch(url))
        .filter(resp => resp.status === 200, resp => Error(`Wrong status: ${resp.status}`))
        .flatMapP(resp => resp.json())
        .validate<MyData>(json => typeof json.x === 'number' ?
            right(json) :
            left(Error(`Failed to deserialise ${json}`))
        );

fetchData(url).run(result => fold(result)(
    data => ... ,
    err => ...
));
```
