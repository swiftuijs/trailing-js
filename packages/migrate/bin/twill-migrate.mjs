#!/usr/bin/env node
import { main } from '../dist/cli.js';

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
