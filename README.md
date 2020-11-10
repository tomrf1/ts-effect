### ts-effect

An experiment to see if I can improve on `Promise` + `await` for async tasks and error handling.

I'm not convinced I've achieved this.

The `Effect` type lets us handle async computations as values, and chain operations.

E.g.

```
interface MyData {x: number}

const fetchData = (url: string): Effect<MyData> =>
    E.fromPromise(() => fetch(url))
        .filter(resp => resp.status === 200, resp => Error(`Wrong status: ${resp.status}`))
        .flatMapP(resp => resp.json())
        .validate<MyData>(json => typeof json.x === 'number' ?
            right(json) :
            left(Error(`Failed to deserialise ${json}`))
        );

fetchData(url).run((result: Either<Error,MyData>) => fold(result)(
    data => ... ,
    err => ...
));
```


##### Possible TODOs:
1. Support for interrupts
2. Ensure stack-safety if an `AsyncEffect` isn't really async