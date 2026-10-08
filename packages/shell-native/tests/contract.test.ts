import * as api from '../src/index.js';
import { defineProcessContracts } from '../../shell/tests/contracts/process.mjs';
defineProcessContracts(api, new URL('../dist/index.js', import.meta.url).href);
