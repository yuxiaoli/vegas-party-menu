import { DEFAULT_LOCALE, LOCALES } from './messages.js';

const preferenceKey = 'vegas-party-menu.locale';
const localeParam = 'lang';
const localizedPaths = Object.keys(LOCALES).filter(locale => locale !== DEFAULT_LOCALE);

// Serialized into the English page head so a saved locale is applied before paint.
function restoreLocale(rootLocale, localePaths, storageKey, param) {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get(param) === rootLocale) {
      localStorage.setItem(storageKey, rootLocale);
      return;
    }
    const preferred = localStorage.getItem(storageKey);
    if (!localePaths.includes(preferred)) return;
    const target = new URL(`./${preferred}/`, url);
    url.searchParams.delete(param);
    target.search = url.search;
    target.hash = url.hash;
    location.replace(target);
  } catch {
    // The page remains navigable in browsers that block local storage.
  }
}

export const localeBootstrapScript = `(${restoreLocale.toString()})(${[
  DEFAULT_LOCALE, localizedPaths, preferenceKey, localeParam
].map(value => JSON.stringify(value)).join(',')});`;

export function initLocaleLinks() {
  const links = [...document.querySelectorAll('[data-locale-link]')];
  const currentLocale = document.documentElement.lang;
  const currentUrl = new URL(location.href);
  if (localizedPaths.includes(currentLocale) || currentUrl.searchParams.get(localeParam) === DEFAULT_LOCALE) {
    try {
      localStorage.setItem(preferenceKey, currentLocale);
    } catch {
      // Explicit language destinations work without storage.
    }
  }

  function syncLinks() {
    const current = new URL(location.href);
    for (const link of links) {
      const target = new URL(link.href);
      target.search = current.search;
      target.hash = current.hash;
      if (link.dataset.localeLink === DEFAULT_LOCALE) target.searchParams.set(localeParam, DEFAULT_LOCALE);
      else target.searchParams.delete(localeParam);
      link.href = target.href;
    }
  }
  addEventListener('hashchange', syncLinks);
  syncLinks();
  return syncLinks;
}
