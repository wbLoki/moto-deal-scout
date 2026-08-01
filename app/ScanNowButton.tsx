'use client';

import { useState, useTransition } from 'react';
import { scanNowAction, type ActionResult } from './actions.js';

/** Admin-only control to run a scan on demand. Scans are shared across users. */
export function ScanNowButton() {
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [scanning, startScan] = useTransition();

  const scan = () => {
    setStatus(null);
    startScan(async () => {
      setStatus(await scanNowAction());
    });
  };

  return (
    <div className="scan-now">
      <button className="btn" onClick={scan} disabled={scanning} type="button">
        {scanning ? 'Scanning…' : 'Scan now'}
      </button>
      {status && (
        <span className={status.ok ? 'settings-status ok' : 'settings-status err'}>
          {status.message}
        </span>
      )}
    </div>
  );
}
