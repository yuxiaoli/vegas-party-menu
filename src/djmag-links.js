export const CATALOG_URL = 'https://yuxiaoli.github.io/djmag-data/';

export function catalogDetailUrl(section, id, locale) {
  if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
  if (section === 'djs') {
    const url = new URL(`djs/${id}.html`, CATALOG_URL);
    // An explicit language takes priority over the DJ site's stored preference.
    if (locale) url.searchParams.set('lang', locale === 'zh-CN' ? 'zh-CN' : 'en');
    return url.href;
  }
  if (section === 'venues') {
    const directory = locale === 'zh-CN' ? 'venues/zh-CN' : 'venues';
    return new URL(`${directory}/${id}.html`, CATALOG_URL).href;
  }
  return null;
}
