import { describe, expect, it } from 'vitest';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { components as reactComponents, component as reactComponent } from '../src/react';
import { components as vueComponents } from '../src/vue';
import { transform } from '../src/compiler';

function compile(body: string, bindings: Record<string, unknown>, builders: string[]) {
  const result = transform(`function example(){${body}}`, {
    filename: 'example.twill.js',
    builders,
  });
  return Function(
    ...Object.keys(bindings),
    result.code + '; return example();',
  )(...Object.values(bindings));
}

describe('framework-independent adapters', () => {
  it('creates elements without invoking React hook components eagerly', () => {
    let renders = 0;
    function Card({ children }: { children?: React.ReactNode }) {
      const [value] = useState('ok');
      renders++;
      return createElement('article', null, value, children);
    }
    const { Card: BuildCard } = reactComponents({ Card });
    const tree = compile('return Card { "child"; "content"; }', { Card: BuildCard }, ['Card']);
    expect(renders).toBe(0);
    expect(renderToStaticMarkup(tree)).toBe('<article>okchildcontent</article>');
    expect(renders).toBe(1);
  });
  it('retains component prop types and supports intrinsic elements', () => {
    const Button = reactComponent('button');
    expect(renderToStaticMarkup(Button({ disabled: true }, () => 'save'))).toContain('disabled');
    // @ts-expect-error invalid intrinsic prop
    Button({ doesNotExist: true });
    const Required = reactComponent(({ title }: { title: string }) =>
      createElement('h1', null, title),
    );
    // @ts-expect-error required props remain required
    Required();
    Required({ title: 'valid' });
  });
  it('keeps Vue slots lazy and renders independent components', async () => {
    let calls = 0;
    const Panel = defineComponent({
      props: { title: String },
      setup(props, { slots }) {
        return () => h('section', null, [h('h1', props.title), ...(slots.default?.() ?? [])]);
      },
    });
    const { Panel: BuildPanel } = vueComponents({ Panel });
    const tree = compile(
      'return Panel({title:"Vue"}) { child(); "tail"; }',
      {
        Panel: BuildPanel,
        child: () => {
          calls++;
          return h('span', 'hello');
        },
      },
      ['Panel'],
    );
    expect(calls).toBe(0);
    const output = await renderToString(createSSRApp({ render: () => tree }));
    expect(output).toBe('<section><h1>Vue</h1><span>hello</span>tail</section>');
    expect(calls).toBe(1);
  });
});
