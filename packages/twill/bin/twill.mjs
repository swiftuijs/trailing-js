#!/usr/bin/env node
import { main } from '../dist/cli.js';

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error.message);
    if (error.frame) console.error(error.frame);
    process.exitCode = 1;
  });
