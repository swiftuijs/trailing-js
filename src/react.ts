import {
  createElement,
  type ElementType,
  type ComponentPropsWithRef,
  type Attributes,
  type ReactElement,
  type ReactNode,
} from 'react';

type Props<C extends ElementType> = Omit<ComponentPropsWithRef<C>, 'children'> &
  Attributes & {
    children?: ReactNode;
  };
type Content = () => ReactNode;
export type ComponentBuilder<C extends ElementType> =
  {} extends Props<C>
    ? { (props?: Props<C>, content?: Content): ReactElement; (content: Content): ReactElement }
    : (props: Props<C>, content?: Content) => ReactElement;

/** Creates elements without calling components directly, preserving React hooks. */
export function component<C extends ElementType>(Component: C): ComponentBuilder<C> {
  const build = (propsOrContent?: Props<C> | Content, content?: Content): ReactElement => {
    const props = typeof propsOrContent === 'function' ? undefined : propsOrContent;
    const children = typeof propsOrContent === 'function' ? propsOrContent : content;
    return children ? createElement(Component, props, children()) : createElement(Component, props);
  };
  return build as ComponentBuilder<C>;
}

/** Adapt selected exports from @swiftuijs/ui or any React component library. */
export function components<T extends Record<string, ElementType>>(
  library: T,
): { [K in keyof T]: ComponentBuilder<T[K]> } {
  return Object.fromEntries(
    Object.entries(library).map(([name, Component]) => [name, component(Component)]),
  ) as { [K in keyof T]: ComponentBuilder<T[K]> };
}
