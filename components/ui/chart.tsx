'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';

export type ChartConfig = Record<
  string,
  {
    color?: string;
    label?: React.ReactNode;
  }
>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

const joinClassNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');

const useChart = () => {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error('Chart components must be used inside <ChartContainer />');
  }

  return context;
};

function ChartStyle({
  config,
  id,
}: {
  config: ChartConfig;
  id: string;
}) {
  const colorVariables = Object.entries(config)
    .filter(([, item]) => item.color)
    .map(([key, item]) => `--color-${key}: ${item.color};`)
    .join(' ');

  if (!colorVariables) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart="${id}"] { ${colorVariables} }`,
      }}
    />
  );
}

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig;
    children: React.ReactElement;
  }
>(function ChartContainer({ children, className, config, id, ...props }, ref) {
  const reactId = React.useId();
  const chartId = `chart-${id || reactId.replace(/:/g, '')}`;
  const contextValue = React.useMemo(() => ({ config }), [config]);

  return (
    <ChartContext.Provider value={contextValue}>
      <div
        className={joinClassNames('min-h-[1px] min-w-0 w-full', className)}
        data-chart={chartId}
        ref={ref}
        {...props}
      >
        <ChartStyle config={config} id={chartId} />
        <RechartsPrimitive.ResponsiveContainer
          height="100%"
          initialDimension={{ height: 1, width: 1 }}
          minHeight={1}
          minWidth={0}
          width="100%"
        >
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});

type ChartTooltipPayload = {
  color?: string;
  dataKey?: number | string;
  name?: number | string;
  payload?: Record<string, unknown>;
  value?: number | string | Array<number | string>;
};

export const ChartTooltip = RechartsPrimitive.Tooltip;

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    active?: boolean;
    hideLabel?: boolean;
    label?: number | string;
    payload?: ChartTooltipPayload[];
    valueFormatter?: (value: ChartTooltipPayload['value']) => React.ReactNode;
  }
>(function ChartTooltipContent(
  { active, className, hideLabel = false, label, payload, valueFormatter },
  ref
) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      className={joinClassNames(
        'rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]',
        className
      )}
      ref={ref}
    >
      {!hideLabel && label !== undefined && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          {label}
        </p>
      )}

      <div className="space-y-2">
        {payload.map((entry, index) => {
          const key = String(entry.dataKey ?? entry.name ?? index);
          const meta = config[key] ?? config[String(entry.name ?? '')];
          const indicatorColor = entry.color || meta?.color || '#0f766e';
          const renderedValue = valueFormatter
            ? valueFormatter(entry.value)
            : Array.isArray(entry.value)
              ? entry.value.join(' / ')
              : entry.value;

          return (
            <div className="flex items-center justify-between gap-3" key={`${key}-${index}`}>
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: indicatorColor }}
                />
                <span className="text-sm font-medium text-slate-600">
                  {meta?.label || entry.name || key}
                </span>
              </div>
              <span className="text-sm font-semibold text-slate-950">{renderedValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
