import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  MatchDecorator,
  Decoration,
  ViewPlugin,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
  HighlightStyle,
  syntaxTree,
} from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from '@codemirror/autocomplete';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { tags } from '@lezer/highlight';

const SOURCE_LIMIT = 20_000;
const colors = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier], class: 'twill-token-keyword' },
  { tag: [tags.string, tags.regexp], class: 'twill-token-string' },
  { tag: [tags.number, tags.bool, tags.null], class: 'twill-token-number' },
  { tag: tags.comment, class: 'twill-token-comment' },
  { tag: [tags.typeName, tags.className, tags.tagName], class: 'twill-token-type' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    class: 'twill-token-function',
  },
  { tag: [tags.operator, tags.punctuation], class: 'twill-token-punctuation' },
]);

// Native TS/JSX highlighting tolerates incomplete syntax. Add contextual Twill
// keywords without coloring string, comment or regular-expression contents.
const keywords = new MatchDecorator({
  regexp:
    /\bdefer\b(?=(?:[^\S\r\n]|\/\*[^\r\n]*?\*\/)*\{)|\bguard\b(?=\s+(?:const\b|[^\s;=:]))|\bcase\b(?:[^\S\r\n]|\/\*[^\r\n]*?\*\/)+(enum)\b/g,
  decorate(add, from, to, match, view) {
    if (match[1]) from = to - match[1].length;
    const node = syntaxTree(view.state).resolveInner(from, 1);
    if (/String|Comment|RegExp/.test(node.name)) return;
    if (view.state.sliceDoc(Math.max(0, from - 1), from) === '.') return;
    add(from, to, Decoration.mark({ class: 'twill-token-keyword twill-contextual-keyword' }));
  },
});
const twillKeywords = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = keywords.createDeco(view);
    }
    update(update: import('@codemirror/view').ViewUpdate) {
      this.decorations = keywords.updateDeco(update, this.decorations);
    }
  },
  { decorations: (instance) => instance.decorations },
);

export function createEditor(
  parent: HTMLElement,
  options: {
    value: string;
    label: string;
    readOnly: boolean;
    jsx: boolean;
    change(value: string): void;
    limit(): void;
  },
) {
  const language = new Compartment();
  let external = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        lineNumbers(),
        foldGutter(),
        drawSelection(),
        bracketMatching(),
        syntaxHighlighting(colors),
        language.of(javascript({ typescript: true, jsx: options.jsx })),
        search({ top: true }),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          role: 'textbox',
          tabindex: '0',
          'aria-label': options.label,
          'aria-multiline': 'true',
          'aria-readonly': String(options.readOnly),
          'aria-describedby': 'playground-editor-help',
          spellcheck: 'false',
          autocapitalize: 'off',
          autocomplete: 'off',
        }),
        EditorState.readOnly.of(options.readOnly),
        EditorView.editable.of(!options.readOnly),
        keymap.of([...searchKeymap, ...foldKeymap]),
        ...(options.readOnly
          ? []
          : [
              history(),
              indentOnInput(),
              closeBrackets(),
              autocompletion(),
              lintGutter(),
              highlightActiveLine(),
              highlightActiveLineGutter(),
              twillKeywords,
              keymap.of([
                indentWithTab,
                ...closeBracketsKeymap,
                ...completionKeymap,
                ...defaultKeymap,
                ...historyKeymap,
              ]),
              EditorState.changeFilter.of((transaction) => {
                if (transaction.docChanged && transaction.newDoc.length > SOURCE_LIMIT) {
                  options.limit();
                  return false;
                }
                return true;
              }),
              EditorView.updateListener.of((update) => {
                if (update.docChanged && !external) options.change(update.state.doc.toString());
              }),
            ]),
      ],
    }),
  });
  return {
    destroy: () => view.destroy(),
    setDocument(value: string) {
      if (value === view.state.doc.toString()) return;
      external = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      } finally {
        external = false;
      }
    },
    setJSX(jsx: boolean) {
      view.dispatch({ effects: language.reconfigure(javascript({ typescript: true, jsx })) });
    },
    setError(error: { offset?: number; message: string } | null) {
      const diagnostics: Diagnostic[] = [];
      if (error?.offset !== undefined) {
        const from = Math.min(view.state.doc.length, Math.max(0, error.offset));
        diagnostics.push({
          from,
          to: Math.min(view.state.doc.length, from + 1),
          severity: 'error',
          message: error.message,
        });
      }
      view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    focus(offset = 0) {
      view.focus();
      view.dispatch({
        selection: { anchor: Math.max(0, Math.min(view.state.doc.length, offset)) },
        scrollIntoView: true,
      });
    },
  };
}
export type CodeEditor = ReturnType<typeof createEditor>;
