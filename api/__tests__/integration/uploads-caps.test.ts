import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, callApi, createTestUser, deleteTestUser, type TestUser } from './helpers.js';

// Roadmap 7.0.41f: a per-user cap on stored photos, and the receipt scan spending a quota unit only after the photo
// is valid. The integration environment sets the receipt quota to 0, so "429" means the quota was consulted and "415"
// or "404" means validation stopped the request first.
vi.hoisted(() => {
  process.env.MAX_STORED_UPLOADS_PER_USER = '2';
});

let user: TestUser;
beforeAll(async () => {
  user = await createTestUser('caps-a');
});
afterAll(async () => {
  await deleteTestUser(user);
});

const put = (name: string, bytes: Uint8Array, contentType: string) =>
  admin.storage
    .from('inventory-images')
    .upload(`${user.id}/receipts/${name}`, bytes, { contentType, upsert: true });
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

describe('upload cap (7.0.41f)', () => {
  it('signs while under the cap and refuses once the user stores the maximum per scope', async () => {
    const first = await callApi('POST', 'uploads/sign', {
      user,
      body: { scope: 'receipts', contentType: 'image/jpeg', ext: 'jpg' },
    });
    expect(first.status).toBe(200);
    expect((await put('one.jpg', JPEG, 'image/jpeg')).error).toBeNull();
    expect((await put('two.jpg', JPEG, 'image/jpeg')).error).toBeNull();
    const refused = await callApi<{ error: { message: string } }>('POST', 'uploads/sign', {
      user,
      body: { scope: 'receipts', contentType: 'image/jpeg', ext: 'jpg' },
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(/limit of stored photos/i);
    // The cap is per scope: item photos are unaffected.
    const items = await callApi('POST', 'uploads/sign', {
      user,
      body: { scope: 'items', contentType: 'image/jpeg', ext: 'jpg' },
    });
    expect(items.status).toBe(200);
  });
});

describe('receipt scan spends the quota only after the photo is valid (7.0.41f)', () => {
  it('a file that is not an image is refused (415) without consulting the quota', async () => {
    expect((await put('notes.jpg', new Uint8Array([1, 2, 3, 4]), 'image/jpeg')).error).toBeNull();
    const res = await callApi('POST', 'ai/receipt-scan', {
      user,
      body: { imagePath: `${user.id}/receipts/notes.jpg` },
    });
    expect(res.status).toBe(415);
  });

  it('a missing photo is 404 without consulting the quota', async () => {
    const res = await callApi('POST', 'ai/receipt-scan', {
      user,
      body: { imagePath: `${user.id}/receipts/nothing-here.jpg` },
    });
    expect(res.status).toBe(404);
  });

  it('a valid photo reaches the quota check (429 here: the test quota is 0)', async () => {
    const res = await callApi('POST', 'ai/receipt-scan', {
      user,
      body: { imagePath: `${user.id}/receipts/one.jpg` },
    });
    expect(res.status).toBe(429);
  });
});
