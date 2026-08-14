/**
 * One-off connectivity check for the Railway Storage Bucket.
 * Run: npx tsx --env-file=.env src/scripts/bucket-smoke.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as bucket from '../services/bucket';

(async () => {
  console.log('configured:', bucket.isBucketConfigured());
  if (!bucket.isBucketConfigured()) process.exit(1);

  const src = path.join(os.tmpdir(), 'bucket-smoke.txt');
  fs.writeFileSync(src, 'bucket connectivity check\n');

  const key = bucket.buildObjectKey('smoke-test', 'hello world.txt');
  await bucket.putFile(key, src, 'text/plain');
  console.log('put ok      :', key);
  console.log('exists      :', await bucket.objectExists(key));

  const stream = await bucket.getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  console.log('read back   :', JSON.stringify(Buffer.concat(chunks).toString()));

  await bucket.deleteObject(key);
  console.log('after delete:', await bucket.objectExists(key));
  fs.unlinkSync(src);
})().catch(e => {
  console.error('FAILED:', e.name, '-', e.message);
  process.exit(1);
});
