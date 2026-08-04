'use client';

import { useActionState, useState } from 'react';
import {
  CATALOG_BRANDS,
  modelsForBrand,
  suggestAliases,
} from '../src/catalog/motorcycleCatalog.js';
import { addModelAction, type AdminModelState } from './admin-actions.js';

const initial: AdminModelState = {};

/**
 * Add a tracked model by picking from the catalog. Brand and model are
 * `<input list=…>` typeaheads backed by `<datalist>`, so you get a searchable
 * dropdown but can still type anything. Choosing a model auto-fills alias
 * suggestions (unless you've edited them). Price/mileage/year stay manual.
 */
export function AddModelPicker() {
  const [state, action, pending] = useActionState(addModelAction, initial);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [aliases, setAliases] = useState('');
  const [aliasesTouched, setAliasesTouched] = useState(false);

  const brandModels = modelsForBrand(brand);

  const onBrandChange = (value: string) => {
    setBrand(value);
    setModel('');
    if (!aliasesTouched) setAliases('');
  };
  const onModelChange = (value: string) => {
    setModel(value);
    if (!aliasesTouched) setAliases(suggestAliases(value).join(', '));
  };

  return (
    <form action={action} className="model-form">
      <div className="model-grid">
        <label>
          <span>Brand</span>
          <input
            name="brand"
            list="catalog-brands"
            value={brand}
            onChange={(e) => onBrandChange(e.target.value)}
            placeholder="Pick or type…"
            autoComplete="off"
            required
          />
          <datalist id="catalog-brands">
            {CATALOG_BRANDS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label>
          <span>Model</span>
          <input
            name="model"
            list="catalog-models"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder={brand ? 'Pick or type…' : 'Choose a brand first'}
            autoComplete="off"
            required
          />
          <datalist id="catalog-models">
            {brandModels.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="wide">
          <span>Aliases (comma-separated)</span>
          <input
            name="aliases"
            value={aliases}
            onChange={(e) => {
              setAliases(e.target.value);
              setAliasesTouched(true);
            }}
            placeholder="Auto-suggested from the model"
          />
        </label>
        <label>
          <span>Price min</span>
          <input type="number" name="priceMin" defaultValue={0} required />
        </label>
        <label>
          <span>Price max</span>
          <input type="number" name="priceMax" defaultValue={100000} required />
        </label>
        <label>
          <span>Max mileage km</span>
          <input type="number" name="maxMileageKm" defaultValue={30000} required />
        </label>
        <label>
          <span>Min year</span>
          <input type="number" name="minYear" defaultValue={2015} required />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="enabled" defaultChecked />
          <span>Enabled</span>
        </label>
      </div>

      <div className="model-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add model'}
        </button>
        {state.message && (
          <span className={state.ok ? 'settings-status ok' : 'settings-status err'}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
