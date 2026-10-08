import * as api from '../src/index.js';
import { defineProcessContracts } from './contracts/process.mjs';
defineProcessContracts(api, new URL('../dist/index.js', import.meta.url).href);
