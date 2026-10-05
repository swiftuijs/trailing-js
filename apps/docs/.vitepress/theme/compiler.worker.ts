import { transform } from '@swiftuijs/twill';
self.onmessage = ({
  data,
}: MessageEvent<{ source: string; filename: string; jsxImportSource: string }>) => {
  try {
    if (data.source.length > 20000)
      throw new Error('The playground accepts up to 20,000 characters.');
    const result = transform(data.source, {
      filename: data.filename,
      jsxImportSource: data.jsxImportSource,
    });
    self.postMessage({
      code: result.code,
      closures: result.closures,
      guards: result.guards,
      defers: result.defers,
    });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
