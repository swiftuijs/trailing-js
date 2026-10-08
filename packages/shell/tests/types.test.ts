import { expectTypeOf, it } from 'vitest';
import { Command, Subprocess, Output, type RunOptions } from '../src/index.js';

it('infers captured output and accounts for omitted policies in typed options', () => {
  // This is a compile-only function: tsc verifies every branch without launching a process.
  async function types(options: RunOptions<ReturnType<typeof Output.text>>) {
    const command = Command.path(process.execPath);
    expectTypeOf((await Subprocess.run(command)).standardOutput).toEqualTypeOf<undefined>();
    const text = await Subprocess.run(command, { output: Output.text({ limit: 100 }) });
    expectTypeOf(text.standardOutput).toEqualTypeOf<string>();
    expectTypeOf(text.standardError).toEqualTypeOf<undefined>();
    const bytes = await Subprocess.run(command, {
      output: Output.bytes({ limit: 100 }),
      error: Output.text({ limit: 100 }),
    });
    expectTypeOf(bytes.standardOutput).toEqualTypeOf<Buffer>();
    expectTypeOf(bytes.standardError).toEqualTypeOf<string>();
    expectTypeOf(
      (await Subprocess.run(command, { output: Output.discard() })).standardOutput,
    ).toEqualTypeOf<undefined>();
    expectTypeOf((await Subprocess.run(command, options)).standardOutput).toEqualTypeOf<
      string | undefined
    >();
    // @ts-expect-error a shell switch is intentionally absent
    await Subprocess.run(command, { shell: true });
    // @ts-expect-error unknown options are rejected alongside valid output policies
    await Subprocess.run(command, { output: Output.text({ limit: 10 }), shell: true });
    // @ts-expect-error capture always requires a byte limit
    Output.text();
    // @ts-expect-error commands must come from a factory
    await Subprocess.run({ executable: 'node', arguments: [] });
    // @ts-expect-error argv snapshots are readonly
    command.arguments.push('changed');
    if (bytes.terminationStatus.kind === 'exited')
      expectTypeOf(bytes.terminationStatus.code).toEqualTypeOf<number>();
    else expectTypeOf(bytes.terminationStatus.signal).toEqualTypeOf<NodeJS.Signals | number>();
  }
  expectTypeOf(types).toBeFunction();
});
