import { describe, expect, it } from 'vitest';
import * as contracts from '@chatchiu/contracts';
import * as apiSchemas from '../_lib/schemas.js';
import * as validation from '../_lib/validation.js';

describe('api/_lib/schemas.ts re-exports packages/contracts (AR-CONTRACTS)', () => {
  it.each([
    'inventoryItemCreate',
    'inventoryItemUpdate',
    'shoppingItemCreate',
    'shoppingItemUpdate',
    'locationCreate',
    'locationUpdate',
    'categoryCreate',
    'categoryUpdate',
    'mealPlanCreate',
    'mealPlanUpdate',
    'recipeCreate',
    'recipeUpdate',
    'wasteCreate',
    'expirationSuggestRequest',
    'receiptScanRequest',
    'signUploadRequest',
  ] as const)('%s is the same object as in contracts', (name) => {
    expect(apiSchemas[name]).toBe(contracts[name]);
  });

  it('field helpers in validation.ts are the contracts ones', () => {
    expect(validation.dateString).toBe(contracts.dateString);
    expect(validation.positiveNumber).toBe(contracts.positiveNumber);
  });

  it('AC-API-03: the update schemas the routes use parse {} to {}', () => {
    expect(apiSchemas.inventoryItemUpdate.parse({})).toEqual({});
    expect(apiSchemas.mealPlanUpdate.parse({})).toEqual({});
  });
});
