'use client';

import { useMemo, useState } from 'react';
import type { StoredModel } from '../src/domain/entities/Model.js';
import { deleteModelAction, saveModelAction } from './admin-actions.js';

function calibrationTitle(model: StoredModel): string {
  if (!model.calibratedAt) return 'Auto-calibrated; awaiting enough market data.';
  const when = new Date(model.calibratedAt);
  const date = Number.isNaN(when.getTime()) ? model.calibratedAt : when.toISOString().slice(0, 10);
  return `Auto-calibrated ${date} from ${model.calibratedSamples ?? 0} listings.`;
}

function EditModelCard({ model }: { model: StoredModel }) {
  return (
    <div className="model-card">
      <div className="model-card-head">
        <strong>
          {model.brand} {model.model}
        </strong>
        <span className={model.enabled ? 'badge on' : 'badge'}>
          {model.enabled ? 'enabled' : 'disabled'}
        </span>
        {model.autoCalibrate ? (
          <span className="badge on" title={calibrationTitle(model)}>
            auto{model.calibratedSamples ? ` · ${model.calibratedSamples}` : ''}
          </span>
        ) : (
          <span className="badge">manual</span>
        )}
        <form action={deleteModelAction} className="inline-form">
          <input type="hidden" name="id" value={model.id} />
          <button className="btn btn-small" type="submit">
            Delete
          </button>
        </form>
      </div>

      <form action={saveModelAction} className="model-form">
        <input type="hidden" name="id" value={model.id} />
        <div className="model-grid">
          <label>
            <span>Brand</span>
            <input name="brand" defaultValue={model.brand} required />
          </label>
          <label>
            <span>Model</span>
            <input name="model" defaultValue={model.model} required />
          </label>
          <label className="wide">
            <span>Aliases (comma-separated)</span>
            <input name="aliases" defaultValue={model.aliases.join(', ')} />
          </label>
          <label>
            <span>Price min</span>
            <input type="number" name="priceMin" defaultValue={model.priceRangeMAD.min} required />
          </label>
          <label>
            <span>Price max</span>
            <input type="number" name="priceMax" defaultValue={model.priceRangeMAD.max} required />
          </label>
          <label>
            <span>Max mileage km</span>
            <input type="number" name="maxMileageKm" defaultValue={model.maxMileageKm} required />
          </label>
          <label>
            <span>Min year</span>
            <input type="number" name="minYear" defaultValue={model.minYear} required />
          </label>
          <label className="checkbox">
            <input type="checkbox" name="enabled" defaultChecked={model.enabled} />
            <span>Enabled</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" name="autoCalibrate" defaultChecked={model.autoCalibrate} />
            <span>Auto-calibrate price</span>
          </label>
        </div>
        <div className="model-actions">
          <button className="btn btn-primary" type="submit">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

/** Searchable list of the tracked models, each an editable card. */
export function ModelsList({ models }: { models: readonly StoredModel[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => `${m.brand} ${m.model}`.toLowerCase().includes(q));
  }, [query, models]);

  return (
    <>
      <input
        className="model-list-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tracked models…"
        aria-label="Search tracked models"
      />
      <p className="settings-hint">
        {filtered.length} of {models.length}
      </p>
      {filtered.length === 0 ? (
        <div className="empty">No models match “{query}”.</div>
      ) : (
        filtered.map((model) => <EditModelCard key={model.id} model={model} />)
      )}
    </>
  );
}
