import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  callApi,
  createCategory,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers.js';

// Roadmap 7.0.10 (test half): production has no is_system categories after the
// hand-run make-categories-editable.sql. global-setup.ts makes the local DB match.

let alice: TestUser | undefined;

beforeAll(async () => {
  alice = await createTestUser('alice');
});

afterAll(async () => {
  await deleteTestUser(alice);
});

describe('a database shaped like production (no system categories)', () => {
  it('AC-DATA-07: the database under test has no is_system categories', async () => {
    const { count, error } = await admin
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('is_system', true);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('AC-API-24: a new user sees no categories until she creates her own', async () => {
    const res = await callApi<{ data: unknown[] }>('GET', 'categories', { user: alice });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('AC-API-24: an item is created with a category the test created itself', async () => {
    const user = alice as TestUser;
    const category = await createCategory(user, 'Dairy');
    const res = await callApi<{ data: { id: number; categoryId: number } }>('POST', 'inventory', {
      user,
      body: {
        name: 'Milk',
        categoryId: category.id,
        quantity: 1,
        unit: 'L',
        expirationDate: '2026-12-01',
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.categoryId).toBe(category.id);

    const listed = await callApi<{ data: Array<{ name: string; isSystem: boolean }> }>(
      'GET',
      'categories',
      { user },
    );
    expect(listed.body.data).toEqual([expect.objectContaining({ name: 'Dairy', isSystem: false })]);
  });
});
