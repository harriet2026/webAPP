'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ChevronRight, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SmartSummaryBadge } from '@/components/shared/smart-summary-badge';
import type { Direction, GeoCountry } from '@/lib/api/security-overview';
import { cn } from '@/lib/utils';
import {
  geoBlockRateBgClass,
  geoBlockRateTextClass,
} from './constants';
import { useGeoDistribution } from './hooks/useSecurityOverview';

interface GeoDistributionCardProps {
  startDate: string;
  endDate: string;
  direction: Direction;
  scopeTenantId: number | null;
}

interface WorldGeoJson {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { iso_a2: string; name_en: string };
    geometry: unknown;
  }>;
}

const THREAT_FILTERS = [
  'all',
  'normal', 'subscription', 'advertising', 'spam',
  'harmful', 'suspicious', 'sensitive', 'spoofing',
  'phishing', 'virus', 'account_compromised',
] as const;
const WORLD_MAP_NAME = 'security-overview-world';
const WORLD_MAP_URL = '/maps/world-countries.geojson';
const ISO_ALPHA2 = /^[A-Z]{2}$/;

let worldMapLoad: Promise<void> | null = null;

function subscribeToColorScheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getDarkModeSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

function ensureWorldMap(): Promise<void> {
  if (echarts.getMap(WORLD_MAP_NAME)) return Promise.resolve();
  if (!worldMapLoad) {
    worldMapLoad = fetch(WORLD_MAP_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load world map: ${response.status}`);
        return response.json() as Promise<WorldGeoJson>;
      })
      .then((geoJson) => {
        echarts.registerMap(
          WORLD_MAP_NAME,
          geoJson as Parameters<typeof echarts.registerMap>[1],
        );
      })
      .catch((error) => {
        worldMapLoad = null;
        throw error;
      });
  }
  return worldMapLoad;
}

export function countryFlagPosition(countryCode: string): string | null {
  const code = countryCode.toUpperCase();
  if (!ISO_ALPHA2.test(code)) return null;
  const row = code.charCodeAt(0) - 65;
  const column = code.charCodeAt(1) - 65;
  return `-${column * 24}px -${row * 18}px`;
}

function CountryFlag({ countryCode }: { countryCode: string }) {
  const backgroundPosition = countryFlagPosition(countryCode);
  if (!backgroundPosition) {
    return <span className="inline-flex h-[18px] w-6 items-center justify-center rounded-sm bg-muted text-[9px] text-muted-foreground">--</span>;
  }
  return (
    <span
      className="inline-block h-[18px] w-6 rounded-sm bg-no-repeat shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"
      style={{
        backgroundImage: "url('/flags/flags-4x3.png')",
        backgroundPosition,
        backgroundSize: '624px 468px',
      }}
      aria-hidden="true"
    />
  );
}

function finiteRate(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function normalizeCountries(countries: GeoCountry[]): GeoCountry[] {
  return countries
    .filter((country) => ISO_ALPHA2.test(country.country.toUpperCase()))
    .map((country) => ({
      ...country,
      country: country.country.toUpperCase(),
      count: Number.isFinite(country.count) ? Math.max(0, country.count) : 0,
      block_rate: finiteRate(country.block_rate),
    }));
}

function WorldThreatMap({
  countries,
  selectedCountry,
  countryName,
  onSelect,
}: {
  countries: GeoCountry[];
  selectedCountry: string | null;
  countryName: (countryCode: string) => string;
  onSelect: (countryCode: string) => void;
}) {
  const t = useTranslations('securityOverview.geo');
  const isDark = useSyncExternalStore(subscribeToColorScheme, getDarkModeSnapshot, () => false);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>(() =>
    echarts.getMap(WORLD_MAP_NAME) ? 'ready' : 'loading',
  );

  useEffect(() => {
    let active = true;
    ensureWorldMap()
      .then(() => {
        if (active) setMapState('ready');
      })
      .catch(() => {
        if (active) setMapState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const countryByCode = useMemo(
    () => new Map(countries.map((country) => [country.country, country])),
    [countries],
  );
  const maxCount = Math.max(1, ...countries.map((country) => country.count));
  const option = useMemo<EChartsOption>(() => ({
    animationDurationUpdate: 250,
    backgroundColor: 'transparent',
    aria: { enabled: true },
    tooltip: {
      trigger: 'item',
      confine: true,
      borderWidth: 0,
      backgroundColor: isDark ? '#111827' : '#1f2937',
      textStyle: { color: '#f9fafb', fontSize: 12 },
      formatter: (params) => {
        const item = Array.isArray(params) ? params[0] : params;
        const code = String(item?.name ?? '');
        const country = countryByCode.get(code);
        const name = countryName(code);
        if (!country) {
          return `<strong>${name}</strong><br/>${t('noThreatData')}`;
        }
        return [
          `<strong>${name}</strong>`,
          `${t('threatEmails')}: ${country.count.toLocaleString()}`,
          `${t('blockRate')}: ${country.block_rate.toFixed(1)}%`,
        ].join('<br/>');
      },
    },
    visualMap: {
      type: 'continuous',
      seriesIndex: 0,
      min: 0,
      max: maxCount,
      orient: 'horizontal',
      left: 12,
      bottom: 8,
      itemWidth: 8,
      itemHeight: 88,
      text: [t('more'), t('less')],
      textGap: 6,
      calculable: false,
      precision: 0,
      textStyle: { color: isDark ? '#d1d5db' : '#6b7280', fontSize: 10 },
      inRange: { color: ['#fee2e2', '#ef4444', '#991b1b'] },
    },
    series: [{
      type: 'map',
      map: WORLD_MAP_NAME,
      nameProperty: 'iso_a2',
      roam: false,
      selectedMode: 'single',
      selectedMap: selectedCountry ? { [selectedCountry]: true } : {},
      layoutCenter: ['50%', '47%'],
      layoutSize: '105%',
      data: countries.map((country) => ({
        name: country.country,
        value: country.count,
      })),
      itemStyle: {
        areaColor: isDark ? '#374151' : '#e5e7eb',
        borderColor: isDark ? '#111827' : '#ffffff',
        borderWidth: 0.6,
      },
      emphasis: {
        label: { show: false },
        itemStyle: { areaColor: '#dc2626', borderColor: '#ffffff', borderWidth: 1 },
      },
      select: {
        label: { show: false },
        itemStyle: { borderColor: '#2563eb', borderWidth: 2.5 },
      },
    }],
  }), [countries, countryByCode, countryName, isDark, maxCount, selectedCountry, t]);

  const onEvents = useMemo(() => ({
    click: (params: { name?: string }) => {
      if (params.name && countryByCode.has(params.name)) onSelect(params.name);
    },
  }), [countryByCode, onSelect]);

  if (mapState === 'loading') {
    return <Skeleton className="h-[260px] w-full rounded-xl" data-testid="geo-map-loading" />;
  }
  if (mapState === 'error') {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl bg-muted/30 text-sm text-muted-foreground" data-testid="geo-map-error">
        {t('mapUnavailable')}
      </div>
    );
  }

  return (
    <div className="h-[260px] overflow-hidden rounded-xl bg-muted/25" data-testid="geo-world-map">
      <ReactECharts
        notMerge
        option={option}
        onEvents={onEvents}
        opts={{ renderer: 'svg' }}
        style={{ height: 260, width: '100%' }}
      />
    </div>
  );
}

export function GeoDistributionCard({ startDate, endDate, direction, scopeTenantId }: GeoDistributionCardProps) {
  const t = useTranslations('securityOverview.geo');
  const tRoot = useTranslations('securityOverview');
  const locale = useLocale();
  const [threatFilter, setThreatFilter] = useState<(typeof THREAT_FILTERS)[number]>('all');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useGeoDistribution({
    startDate,
    endDate,
    direction,
    threatFilter,
    scopeTenantId,
  });

  const countries = useMemo(() => normalizeCountries(data?.countries ?? []), [data?.countries]);
  const totalCount = countries.reduce((sum, country) => sum + country.count, 0);
  const hasData = countries.length > 0 && totalCount > 0;
  const displayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return new Intl.DisplayNames(['en'], { type: 'region' });
    }
  }, [locale]);
  const countryName = useCallback(
    (countryCode: string) => displayNames.of(countryCode) ?? countryCode,
    [displayNames],
  );
  const activeCountry = selectedCountry && countries.some((country) => country.country === selectedCountry)
    ? selectedCountry
    : null;
  const selectedName = activeCountry ? countryName(activeCountry) : null;
  const summary = countries
    .slice(0, 3)
    .map((country) => `${countryName(country.country)}(${Math.round((country.count / totalCount) * 100)}%)`)
    .join(locale.startsWith('zh') ? '、' : ', ');
  return (
    <Card className="min-w-0" data-testid="geo-distribution-card" aria-busy={isFetching}>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex min-w-0 items-center gap-2">
            <Globe className="h-4 w-4 shrink-0 text-primary" />
            <span>{t('title')}</span>
            {selectedName && (
              <>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{selectedName}</span>
              </>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {activeCountry && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedCountry(null)}>
                <ArrowLeft className="h-4 w-4" />
                {t('backToWorld')}
              </Button>
            )}
            <Select
              value={threatFilter}
              onValueChange={(value) => setThreatFilter((value ?? 'all') as (typeof THREAT_FILTERS)[number])}
            >
              <SelectTrigger size="sm" className="w-32" aria-label={t('threatFilter')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THREAT_FILTERS.map((filter) => (
                  <SelectItem key={filter} value={filter}>
                    {filter === 'all' ? t('allThreats') : tRoot(`emailTypes.${filter}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {hasData && !isLoading && (
          <SmartSummaryBadge className="flex w-full">
            {t('summary', { sources: summary })}
          </SmartSummaryBadge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <Skeleton className="h-[260px] rounded-xl" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ) : !hasData ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-xl bg-muted/20 text-muted-foreground" data-testid="geo-empty-state">
            <Globe className="h-8 w-8 opacity-50" />
            <span>{t('empty')}</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <WorldThreatMap
                countries={countries}
                selectedCountry={activeCountry}
                countryName={countryName}
                onSelect={setSelectedCountry}
              />
              <div className="min-w-0 flex flex-col gap-3">
                <h3 className="text-sm font-medium text-foreground">{t('topRegions')}</h3>
                <ol className="max-h-[226px] space-y-1 overflow-y-auto pr-1" data-testid="geo-ranking">
                  {countries.slice(0, 10).map((country, index) => {
                    const blockRate = finiteRate(country.block_rate);
                    const isSelected = activeCountry === country.country;
                    return (
                      <li key={country.country}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          )}
                          data-country-code={country.country}
                          aria-label={`${index + 1}. ${countryName(country.country)}`}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedCountry(country.country)}
                        >
                          <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{index + 1}</span>
                          <span className="w-6 shrink-0"><CountryFlag countryCode={country.country} /></span>
                          <span className="min-w-0 flex-1 truncate text-sm">{countryName(country.country)}</span>
                          <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">{country.count.toLocaleString()}</span>
                          <span className="hidden w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                            <span className={cn('block h-1.5 rounded-full', geoBlockRateBgClass(blockRate))} style={{ width: `${blockRate}%` }} />
                          </span>
                          <span className={cn('w-12 shrink-0 text-right text-xs tabular-nums', geoBlockRateTextClass(blockRate))}>
                            {blockRate.toFixed(1)}%
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {/* Block-rate colour legend */}
                <div className="border-t pt-2">
                  <p className="mb-1.5 text-xs text-muted-foreground">{t('blockRateLegend')}</p>
                  <div className="flex flex-col gap-1">
                    {([
                      { key: 'blockRateGood', cls: 'bg-success' },
                      { key: 'blockRateWarn', cls: 'bg-warning' },
                      { key: 'blockRateBad',  cls: 'bg-danger'  },
                    ] as const).map(({ key, cls }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} />
                        <span className="text-xs text-muted-foreground">{t(key)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}
