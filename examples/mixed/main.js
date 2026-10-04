// A native JS entry imports TS; TS imports Twill; Twill imports native TS/JS.
import { run } from './consumer.ts';
console.log(JSON.stringify(await run(), null, 2));
