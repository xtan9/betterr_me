import { useLocale, useTranslations } from 'next-intl';

export function useHistoryDate() {
  const locale = useLocale();
  return (value: number) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(value);
}

export function useHistoryNames() {
  const t = useTranslations('focus');
  return {
    source: (label: string, number: number) => t('sourceName', { label, number }),
    rule: (label: string | null, number: number) => label ? t('namedLimit', { label, number }) : t('unnamedLimit', { number }),
    platform: (value: 'ios' | 'macos' | 'web') => ({ ios: 'iOS', macos: 'macOS', web: 'Web' })[value],
  };
}
