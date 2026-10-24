import { useLocale } from 'next-intl';

export function useHistoryDate() {
  const locale = useLocale();
  return (value: number) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(value);
}
