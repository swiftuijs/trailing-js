import yauzl from 'yauzl';

/** Preserve ZIP path casing; VSCE's internal readZip lowercases every entry. */
export function readVsix(filename, filter = () => true) {
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const files = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/') || !filter(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (error, stream) => {
          if (error) {
            zip.close();
            reject(error);
            return;
          }
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
