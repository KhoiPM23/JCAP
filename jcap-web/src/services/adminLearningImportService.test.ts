import assert from 'node:assert/strict';
import test from 'node:test';
import { adminLearningImportService } from './adminLearningImportService.ts';

// Node has no browser storage. Install the isolated test stub before mocking it.
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null }, configurable: true });

test('preview sends the workbook as multipart with bearer token and no JSON content type', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/admin/learning/import/preview');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.headers['Content-Type'], undefined);
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get('file').name, 'sample.xlsx');
    assert.equal(options.body.get('fileHash'), null);
    return new Response(JSON.stringify({ success: true, data: { canImport: true, fileHash: 'HASH' } }));
  });
  t.mock.method(globalThis.localStorage, 'getItem', () => 'test-token');
  const result = await adminLearningImportService.upload(new File(['xlsx'], 'sample.xlsx'));
  assert.equal(result.fileHash, 'HASH');
});

test('confirm sends the exact preview hash and returns row-level validation failures', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/admin/learning/import/confirm');
    assert.equal(options.body.get('fileHash'), 'ORIGINAL_HASH');
    return new Response(JSON.stringify({ success: true, data: { canImport: false, imported: false, issues: [{ sheet: 'Topics', row: 2 }] } }));
  });
  t.mock.method(globalThis.localStorage, 'getItem', () => null);
  const result = await adminLearningImportService.upload(new File(['xlsx'], 'sample.xlsx'), 'ORIGINAL_HASH');
  assert.equal(result.imported, false); assert.equal(result.issues[0].row, 2);
});

test('upload surfaces authentication and upload size errors without claiming success', async t => {
  t.mock.method(globalThis.localStorage, 'getItem', () => null);
  const file = new File(['xlsx'], 'sample.xlsx');
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));
  await assert.rejects(adminLearningImportService.upload(file), /đăng nhập/);
  fetch.mock.mockImplementation(async () => new Response('', { status: 413 }));
  await assert.rejects(adminLearningImportService.upload(file), /5 MB/);
});
