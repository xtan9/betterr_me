'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

type RecordIdentity = { source: { id: string }; event: { id: string } };
export function useRecordedHistory<T extends RecordIdentity>(url: string, schema: z.ZodType<{ schemaVersion: 1; items: T[]; nextCursor: string | null }>, onUnauthorized: () => void) {
  const [state, setState] = useState({ items: [] as T[], nextCursor: null as string | null, loading: true, loaded: false, error: false, refreshedAt: null as number | null });
  const request = useRef<{ generation: number; controller?: AbortController; cursor: string | null }>({ generation: 0, cursor: null });
  const read = useCallback(async (cursor: string | null) => {
    const generation = ++request.current.generation;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current = { generation, controller, cursor };
    setState(previous => ({ ...previous, loading: true, error: false }));
    try {
      const response = await fetch(`${url}?limit=50${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (generation !== request.current.generation) return;
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error('unavailable');
      const page = schema.parse(await response.json());
      if (generation !== request.current.generation) return;
      setState(previous => ({ items: [...new Map([...previous.items, ...page.items].map(item => [`${item.source.id.toLowerCase()}:${item.event.id.toLowerCase()}`, item])).values()],
        nextCursor: page.nextCursor, loading: false, loaded: true, error: false, refreshedAt: Date.now() }));
    } catch {
      if (generation === request.current.generation) setState(previous => ({ ...previous, loading: false, error: true }));
    }
  }, [url, schema, onUnauthorized]);
  useEffect(() => {
    void read(null);
    return () => { ++request.current.generation; request.current.controller?.abort(); };
  }, [read]);
  return { ...state, refresh: () => void read(request.current.cursor), more: () => void read(state.nextCursor) };
}
