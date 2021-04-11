### ts-effect

An experiment to see if I can improve on `Promise` + `await` for async tasks and error handling.

I'm not convinced I've achieved this.

The `Effect` type (inspired by certain Scala libraries) lets us handle async computations as values, and chain operations.
Error types are encoded in the `Effect` type, as an alternative to exceptions/rejections.

E.g.

```typescript
import { E, EitherApi } from 'ts-effect';
import type { Effect } from 'ts-effect';

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
            EitherApi.success(json.x) :
            EitherApi.failure(error('BAD_DATA', JSON.stringify(json)))
        );

fetchData(url).run(result => EitherApi.fold(result)(
    (data: number) => ... ,
    (err: FetchError) => ...
));
```

### API

#### `sync`
Construct an Effect from a synchronous function that may throw an exception.
If an exception is thrown when the Effect is run then the Effect will fail with the exception value (of type `unknown`).
A `Task<A>` is an `Effect<unknown,A>`.

```typescript
const encodeURIEffect = (uri: string): Task<string> => sync(() => encodeURI(uri))
```

#### `async`
Construct an asynchronous Effect. The function takes a callback, into which it passes an `Either<E,A>` indicating success or failure.
```typescript
const openFile = (path: string): Effect<Error,number> => async(complete =>
    fs.open(path, 'r', (err: Error | null, fd: number) => {
        if (err) complete(failure(err));
        else complete(success(fd));
    })
);
```

#### `asyncP`
Construct an asynchronous Effect from a Promise. We cannot know the type of a Promise rejection value, so the error type is `unknown`.
```typescript
const fetchEffect = (url: string): Effect<string,Response> => 
    asyncP(() => fetch(url))
        .mapError((err: unknown) => `Fetch error: $err`);
```

#### `manage`
Constructs an Effect while guaranteeing that a resource will be released.
```typescript
const safelyReadToString = (path: string): Effect<Error,string> =>
    manage<Error,FileDescriptor,string>(
        openFile(path),
        closeFile,
        readToString
    );
```

#### `all`
Combine results of many Effects into a single Effect.
```typescript
const fetchAll = (requests: Effect<Error,Response>[]): Effect<Error, Response[]> => all(requests);
```

#### `chain`
Chain (flatMap) together an array of Effect-producing functions.
```typescript
const f = (
    e: Effect<Error,string>,
    f1: (s: string) => Effect<Error,number>,
    f2: (n: number) => Effect<Error,Response>
): Effect<string,Response> => chain(e, [f1, f2]);
```
