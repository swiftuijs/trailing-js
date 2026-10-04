import { h, type Component, type FunctionalComponent, type VNode, type VNodeChild } from 'vue';

type Props<C> = C extends new (...args: any[]) => { $props: infer P }
  ? P
  : C extends FunctionalComponent<infer P>
    ? P
    : Record<string, unknown>;
export type ComponentBuilder<C extends Component> =
  {} extends Props<C>
    ? { (props?: Props<C>, content?: () => VNodeChild): VNode; (content: () => VNodeChild): VNode }
    : (props: Props<C>, content?: () => VNodeChild) => VNode;

/** Vue slots remain lazy: the child invokes the closure during its own render. */
export function component<C extends Component>(Component: C): ComponentBuilder<C> {
  return ((propsOrContent?: Props<C> | (() => VNodeChild), content?: () => VNodeChild) => {
    const props = typeof propsOrContent === 'function' ? undefined : propsOrContent;
    const slot = typeof propsOrContent === 'function' ? propsOrContent : content;
    return h(Component, props as any, slot ? { default: slot } : undefined);
  }) as ComponentBuilder<C>;
}

export function components<T extends Record<string, Component>>(
  library: T,
): { [K in keyof T]: ComponentBuilder<T[K]> } {
  return Object.fromEntries(
    Object.entries(library).map(([name, Component]) => [name, component(Component)]),
  ) as { [K in keyof T]: ComponentBuilder<T[K]> };
}
