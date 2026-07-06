import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export interface ActiveDefaultSite {
  defaultSiteId: string | null;
  defaultOrgId: string | null;
  defaultSite: { id: string; name: string; siteNum: string } | null;
  defaultOrg: { id: string; name: string; code: string } | null;
}

export const DEFAULT_SITE_CHANGE_EVENT = 'eam-default-site-change';

interface DefaultInfoResponse extends ActiveDefaultSite {
  useDefaultSiteAsFilter: boolean;
}

interface DefaultSiteContext extends ActiveDefaultSite {
  useDefaultSiteAsFilter: boolean;
}

let cached: DefaultSiteContext | null = null;
let loadPromise: Promise<DefaultSiteContext | null> | null = null;

export function notifyDefaultSiteChange(info: ActiveDefaultSite) {
  cached = cached
    ? { ...cached, ...info }
    : { ...info, useDefaultSiteAsFilter: true };
  window.dispatchEvent(new CustomEvent(DEFAULT_SITE_CHANGE_EVENT, { detail: info }));
}

async function loadDefaultSiteContext(): Promise<DefaultSiteContext | null> {
  if (cached) return cached;
  if (loadPromise) return loadPromise;
  loadPromise = api<DefaultInfoResponse>('/account/default-info')
    .then((data) => {
      const next: DefaultSiteContext = {
        defaultSiteId: data.defaultSiteId,
        defaultOrgId: data.defaultOrgId,
        defaultSite: data.defaultSite,
        defaultOrg: data.defaultOrg,
        useDefaultSiteAsFilter: data.useDefaultSiteAsFilter,
      };
      cached = next;
      return next;
    })
    .catch(() => null)
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

export function useActiveDefaultSite() {
  const [state, setState] = useState<DefaultSiteContext | null>(cached);
  const [ready, setReady] = useState(cached !== null);

  useEffect(() => {
    let cancelled = false;

    void loadDefaultSiteContext().then((next) => {
      if (!cancelled) {
        if (next) setState(next);
        setReady(true);
      }
    });

    function onChange(e: Event) {
      const detail = (e as CustomEvent<ActiveDefaultSite>).detail;
      if (detail) {
        setState((prev) =>
          prev
            ? { ...prev, ...detail }
            : { ...detail, useDefaultSiteAsFilter: true },
        );
      }
    }

    window.addEventListener(DEFAULT_SITE_CHANGE_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(DEFAULT_SITE_CHANGE_EVENT, onChange);
    };
  }, []);

  return {
    defaultSiteId: state?.defaultSiteId ?? null,
    defaultOrgId: state?.defaultOrgId ?? null,
    defaultSite: state?.defaultSite ?? null,
    defaultOrg: state?.defaultOrg ?? null,
    useDefaultSiteAsFilter: state?.useDefaultSiteAsFilter ?? false,
    ready,
  };
}
