import {succeedEffect, run, syncEffect, Effect2, asyncEffect, failEffect} from "../src/effect";
import {Either, fold, right} from "../src/either";

const e1 = succeedEffect(1);
const e2 = e1.flatMap<number>(n => asyncEffect((c) => c(right(n+1))));
const e3 = e2.flatMap<number>(n => asyncEffect((c) => c(right(n+1))));
const e4 = e3.map(n => n+1).flatMap(n => failEffect(Error('FAILED!'))).recover(e => -1).map(n => `${n}`);

export const v2 = () => {
    run(e4, (result: Either<Error, number>) => {
        console.log("got result", result)
        fold(result)(
            n => console.log(n),
            err => console.error(err)
        )
    });

    // const incrementEffect = (e: Effect2<number>): Effect2<number> => e.map(n => {
    //     console.log(n);
    //     return n+1
    // });
    //
    // let e: Effect2<number> = succeedEffect(0);
    // for (let i = 0; i < 10000; i++) {
    //     e = incrementEffect(e);
    // }
    // run(e,r => console.log("result",r));
};
