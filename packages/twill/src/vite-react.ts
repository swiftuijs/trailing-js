import react, { type Options as ReactOptions } from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';
import twill, { type PluginOptions } from './vite.js';

export interface TwillReactOptions {
  twill?: PluginOptions;
  react?: ReactOptions;
}

/** Compose the normal Vite React plugin with dialect compilation and refresh
 * filtering. Component libraries keep ordinary React APIs and JSX semantics. */
export default function twillReact(options: TwillReactOptions = {}): PluginOption[] {
  if (options.react?.jsxRuntime === 'classic')
    throw new Error('Twill React uses the automatic JSX runtime.');
  const jsxImportSource = options.react?.jsxImportSource ?? options.twill?.jsxImportSource;
  // An absent override must leave standard tsconfig inheritance intact.
  const runtime = jsxImportSource === undefined ? {} : { jsxImportSource };
  return [
    twill({ ...options.twill, ...runtime }),
    react({
      include: /\.(?:[cm]?[jt]sx?|twillx?)(?:\?.*)?$/,
      ...options.react,
      ...runtime,
    }),
  ];
}
