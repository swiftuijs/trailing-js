import * as api from '../src/index.twill';
import { defineProcessContracts } from './contracts/process.mjs';
defineProcessContracts(api, new URL('../dist/index.js', import.meta.url).href);
