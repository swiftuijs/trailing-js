import type MagicString from 'magic-string';
import type { SourceMap } from 'magic-string';
import {
  TraceMap,
  decodedMappings,
  encodedMappings,
  generatedPositionFor,
} from '@jridgewell/trace-mapping';

type Node = { type: string; start: number; end: number; [key: string]: any };
type Insertion = {
  anchor: number;
  before: boolean;
  text: string;
  copies: { start: number; sourceStart: number; length: number }[];
};

/** Find free type references, respecting generic function/mapped/infer binders. */
function references(
  node: Node,
  names: Set<string>,
  found = new Set<string>(),
  bound = new Set<string>(),
) {
  const local = new Set(bound);
  for (const parameter of node.typeParameters?.params ?? []) local.add(parameter.name);
  if (node.type === 'TSMappedType') local.add(node.typeParameter.name);
  if (node.type === 'TSInferType') local.add(node.typeParameter.name);
  if (node.type === 'TSTypeReference' && node.typeName.type === 'Identifier') {
    const name = node.typeName.name;
    if (names.has(name) && !local.has(name)) found.add(name);
  }
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'typeName'].includes(key)) continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!child?.type) continue;
      const childBound = new Set(local);
      if (node.type === 'TSConditionalType' && key === 'trueType') {
        const bind = (part: Node) => {
          if (part.type === 'TSInferType') childBound.add(part.typeParameter.name);
          for (const [property, nested] of Object.entries(part)) {
            if (property === 'loc') continue;
            // An inner conditional's extends clause owns its own infer binders.
            // Its check/true/false branches may still infer for this outer clause.
            if (part.type === 'TSConditionalType' && property === 'extendsType') continue;
            for (const item of Array.isArray(nested) ? nested : [nested])
              if (item?.type) bind(item);
          }
        };
        bind(node.extendsType);
      }
      references(child, names, found, childBound);
    }
  }
  return found;
}

export function enumTypeParameters(node: Node, branch: Node) {
  const parameters: Node[] = node.typeParameters?.params ?? [];
  const names = new Set(parameters.map((parameter) => parameter.name));
  const used = new Set<string>();
  for (const field of branch.params) references(field.typeAnnotation, names, used);
  // Constraints/defaults may reference an earlier enum type parameter.
  for (let size = -1; size !== used.size;) {
    size = used.size;
    for (const parameter of parameters) {
      if (!used.has(parameter.name)) continue;
      if (parameter.constraint) references(parameter.constraint, names, used);
      if (parameter.default) references(parameter.default, names, used);
    }
  }
  return parameters.filter((parameter) => used.has(parameter.name));
}

/** Tagged records and precise factories; no application runtime is introduced. */
export function lowerEnums(source: string, ast: Node, enums: Node[], code: MagicString) {
  const insertions: Insertion[] = [];
  const exported = new Set<Node>();
  const visit = (node: Node) => {
    if (node.type === 'ExportNamedDeclaration') exported.add(node.declaration);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'trailing'].includes(key)) continue;
      for (const child of Array.isArray(value) ? value : [value]) if (child?.type) visit(child);
    }
  };
  visit(ast);
  for (const node of enums) {
    const replacement: Insertion = {
      anchor: node.braceStart,
      before: false,
      text: '= ',
      copies: [],
    };
    for (const [index, branch] of node.cases.entries()) {
      if (index) replacement.text += ' | ';
      replacement.text += `{ readonly kind: ${JSON.stringify(branch.id.name)}; `;
      for (const field of branch.params) {
        replacement.text += 'readonly ';
        const text = source.slice(field.start, field.typeAnnotation.end);
        replacement.copies.push({
          start: replacement.text.length,
          sourceStart: field.start,
          length: text.length,
        });
        replacement.text += text + '; ';
      }
      replacement.text += '}';
    }
    replacement.text += `; ${exported.has(node) ? 'export ' : ''}const `;
    replacement.copies.push({
      start: replacement.text.length,
      sourceStart: node.id.start,
      length: node.id.end - node.id.start,
    });
    replacement.text += source.slice(node.id.start, node.id.end) + ' = {';
    insertions.push(replacement);
    code.overwrite(node.start, node.start + 4, 'type');
    code.overwrite(node.braceStart, node.braceStart + 1, replacement.text);
    for (const branch of node.cases) {
      code.remove(branch.start, branch.start + 4);
      const parameters = enumTypeParameters(node, branch);
      const copied: Insertion = {
        anchor: branch.id.end,
        before: true,
        text: parameters.length ? '<' : '',
        copies: [],
      };
      for (const [index, parameter] of parameters.entries()) {
        if (index) copied.text += ', ';
        const text = source.slice(parameter.start, parameter.end);
        copied.copies.push({
          start: copied.text.length,
          sourceStart: parameter.start,
          length: text.length,
        });
        copied.text += text;
      }
      if (parameters.length) copied.text += '>';
      const generic = copied.text;
      if (generic) insertions.push(copied);
      code.appendLeft(branch.id.end, generic + (branch.hasParens ? '' : '()'));
      const fields = branch.params.map((field: Node) => field.name);
      // Const assertion only narrows the fresh literal; it does not mask type errors.
      code.appendLeft(
        branch.valueEnd,
        `{ return { kind: ${JSON.stringify(branch.id.name)}${fields.length ? ', ' + fields.join(', ') : ''} } as const; },`,
      );
      if (source[branch.end - 1] === ';') code.remove(branch.end - 1, branch.end);
    }
    code.appendLeft(node.end, ';');
  }
  return insertions;
}

/** Generated type copies map to their actual source tokens, including .d.ts maps. */
export function mapEnumCopies(
  source: string,
  generated: string,
  map: SourceMap,
  insertions: Insertion[],
) {
  const starts = (text: string) => {
    const result = [0];
    for (let index = 0; index < text.length; index++)
      if (text[index] === '\n') result.push(index + 1);
    return result;
  };
  const originalLines = starts(source),
    generatedLines = starts(generated);
  const position = (lines: number[], offset: number) => {
    let line = 0;
    while (line + 1 < lines.length && lines[line + 1]! <= offset) line++;
    return { line, column: offset - lines[line]! };
  };
  const trace = new TraceMap(map as any);
  const decoded = decodedMappings(trace);
  const copies: { generatedStart: number; sourceStart: number; length: number }[] = [];
  for (const insertion of insertions) {
    const anchor = position(originalLines, insertion.anchor);
    const location = generatedPositionFor(trace, {
      source: map.sources[0]!,
      line: anchor.line + 1,
      column: anchor.column,
    });
    const offset =
      generatedLines[location.line! - 1]! +
      location.column! -
      (insertion.before ? insertion.text.length : 0);
    if (generated.slice(offset, offset + insertion.text.length) !== insertion.text)
      throw new Error('Enum mapping anchor does not match generated text.');
    for (const copy of insertion.copies) {
      copies.push({
        generatedStart: offset + copy.start,
        sourceStart: copy.sourceStart,
        length: copy.length,
      });
      for (let index = 0; index < copy.length; index++) {
        const target = position(generatedLines, offset + copy.start + index);
        const original = position(originalLines, copy.sourceStart + index);
        const line = decoded[target.line]!;
        const entry: [number, number, number, number] = [
          target.column,
          0,
          original.line,
          original.column,
        ];
        const existing = line.findIndex((segment) => segment[0] === target.column);
        if (existing >= 0) line[existing] = entry;
        else line.push(entry);
      }
    }
  }
  for (const line of decoded) line.sort((left, right) => left[0] - right[0]);
  map.mappings = encodedMappings(
    new TraceMap({ ...JSON.parse(map.toString()), mappings: decoded }),
  );
  return copies;
}
