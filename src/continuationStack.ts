import {Effect} from "./effect";

// To assist stack-safe interpretation of composed Effects we add them to a stack of Continuations, which includes any error handlers
export interface Continuation<E,A,B> {
    type: 'Success' | 'Failure';
    f: (x: A) => Effect<E,B>;
}
export class ContinuationStack<E,A> {
    private stack: Continuation<any,any,any>[];

    constructor() {
        this.stack = [];
    }

    nextContinuation(type: 'Success' | 'Failure'): Continuation<any,any,any> | undefined {
        // Discard any Continuations until an appropriate handler is found
        let next = this.stack.pop();
        while (next && next.type !== type) {
            next = this.stack.pop();
        }
        return next;
    }

    nextSuccess(): Continuation<any,any,any> | undefined {
        return this.nextContinuation('Success');
    }
    nextFailure(): Continuation<any,any,any> | undefined {
        return this.nextContinuation('Failure');
    }

    pushSuccess<A,B>(f: (x: A) => Effect<E,B>): void {
        this.stack.push({type: 'Success', f});
    }
    pushFailure<B>(f: (x: Error) => Effect<E,B>): void {
        this.stack.push({type: 'Failure', f});
    }
}
