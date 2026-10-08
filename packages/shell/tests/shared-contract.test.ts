import * as api from '@swiftuijs/twill-shell';
import { defineProcessContracts } from './contracts/process.mjs';
defineProcessContracts(api, new URL('../dist/index.js', import.meta.url).href);
