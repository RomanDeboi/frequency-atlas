const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Transpile the real TypeScript adapter (no live Supabase account is required).
const source = fs.readFileSync(path.join(__dirname, '../lib/cloudAdapter.ts'), 'utf8');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const cloudModule = { exports: {} };
new Function('module', 'exports', 'require', result.outputText)(cloudModule, cloudModule.exports, require);
const { createCloudAdapter } = cloudModule.exports;

// FileReader is browser-only; this implements just the FileReader path used by exportBackup.
global.FileReader = class {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(data => {
      this.result = `data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;
      this.onload?.();
    }).catch(e => { this.error = e; this.onerror?.(); });
  }
};

class MockSupabase {
  constructor() { this.vaults = new Map(); this.objects = new Map(); }
  client(userId) {
    const db = this;
    return {
      from(name) {
        assert.equal(name, 'atlas_vaults');
        return { select(columns) {
          return { eq(key, id) {
            assert.equal(key, 'user_id');
            assert.equal(id, userId);
            return { async maybeSingle() {
              const existing = db.vaults.get(userId);
              if (!existing) return { data: null, error: null };
              return { data: columns === 'revision'
                ? { revision: existing.revision }
                : structuredClone(existing), error: null };
            } };
          } };
        } };
      },
      async rpc(name, { expected_revision, next_records }) {
        assert.equal(name, 'save_atlas_vault');
        const previous = db.vaults.get(userId) || { revision: 0, records: [] };
        if (previous.revision !== expected_revision) {
          return { data: null, error: { code: '40001', message: 'VERSION_CONFLICT' } };
        }
        const updated = { revision: previous.revision + 1, records: structuredClone(next_records) };
        db.vaults.set(userId, updated);
        return { data: updated.revision, error: null };
      },
      storage: { from(bucket) {
        assert.equal(bucket, 'atlas-screenshots');
        return {
          async upload(p, blob, options) {
            assert.ok(p.startsWith(`${userId}/`));
            assert.equal(options.upsert, false);
            if (db.objects.has(p)) return { error: { message: 'duplicate' } };
            db.objects.set(p, blob); return { error: null };
          },
          async createSignedUrls(paths) {
            return { data: paths.map(p => db.objects.has(p)
              ? { signedUrl: `https://signed.invalid/${p}?token=demo`, error: null }
              : { signedUrl: null, error: 'missing' }), error: null };
          },
          async remove(paths) { paths.forEach(p => db.objects.delete(p)); return { error: null }; },
          async download(p) { return db.objects.has(p)
            ? { data: db.objects.get(p), error: null }
            : { data: null, error: { message: 'missing' } }; },
        };
      } },
    };
  }
}

async function main() {
  const id = '11111111-2222-4333-8444-555555555555';
  const db = new MockSupabase();
  const first = createCloudAdapter(db.client(id), id);
  assert.deepEqual(await first.load(), []);
  const rec = {
    id: 'test-band', entityId: 'test-entity', entity: 'Lab test', band: 'Test spectrum',
    cat: 'other', a: 100, b: 110, images: [{ id: 'shot', name: 'test.png', kind: 'spectrum',
      caption: 'example', dataUrl: 'data:image/png;base64,AA==' }],
  };
  const firstSave = await first.save([rec]);
  assert.equal(firstSave.records.length, 1);
  assert.equal(db.objects.size, 1);
  assert.equal(db.vaults.get(id).revision, 1);
  assert.ok(firstSave.records[0].images[0].dataUrl.startsWith('https://signed.invalid/'));
  assert.equal(db.vaults.get(id).records[0].images[0].dataUrl, undefined);
  assert.equal(await first.hasRemoteChanges(), false);

  const second = createCloudAdapter(db.client(id), id);
  const secondData = await second.load();
  assert.equal(secondData[0].band, rec.band);
  assert.ok(secondData[0].images[0].storagePath.startsWith(`${id}/`));
  const portable = await first.exportBackup(firstSave.records);
  assert.equal(portable[0].images[0].dataUrl, 'data:image/png;base64,AA==');
  assert.equal(portable[0].images[0].storagePath, undefined);

  const changed = await first.save([{ ...firstSave.records[0], band: 'Renamed' }]);
  assert.equal(db.vaults.get(id).revision, 2);
  assert.equal(await second.hasRemoteChanges(), true);
  const stale = [{ ...secondData[0], images: [
    ...secondData[0].images,
    { id: 'shot2', name: 'new.png', kind: 'spectrum', dataUrl: 'data:image/png;base64,AA==' },
  ] }];
  await assert.rejects(() => second.save(stale), /Конфлікт версій/);
  assert.equal(db.objects.size, 1, 'new screenshot uploaded during conflict was removed');
  assert.equal(db.vaults.get(id).records[0].band, 'Renamed');

  const withoutImages = await first.save([{ ...changed.records[0], images: [] }]);
  assert.equal(withoutImages.records[0].images.length, 0);
  assert.equal(db.objects.size, 0, 'deleted screenshot removed from Storage');
  await assert.rejects(() => first.save([{ ...rec, images: [{ ...rec.images[0],
    dataUrl: 'data:text/html;base64,AA==' }] }]), /Дозволено тільки/);
  assert.equal(db.vaults.get(id).revision, 3);
  console.log('PASS: cloud load/save, signed images, portable backup, revision conflict, screenshot rollback and removal');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
