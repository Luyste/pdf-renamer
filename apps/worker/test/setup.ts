import { plugin } from 'bun';

// src/index.ts re-exports OcrContainer, and @cloudflare/containers imports
// `cloudflare:workers`, which only exists inside workerd. The tests never
// construct the container (the OCR binding is faked), so empty classes are
// enough for the import to succeed.
plugin({
  name: 'cloudflare-workers-stub',
  setup(build) {
    build.module('cloudflare:workers', () => ({
      exports: { DurableObject: class {}, WorkerEntrypoint: class {} },
      loader: 'object',
    }));
  },
});

// Every request logs two info lines; keep test output to warnings and errors.
console.log = () => {};
