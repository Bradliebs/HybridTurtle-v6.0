'use client';

import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Brush,
} from 'recharts';

interface EquityCurveChartProps {
  data: { date: string; value: number }[];
}

type TimeRange = 'D' | 'W' | 'M' | '3M' | 'Y';

const RANGE_DAYS: Record<TimeRange, number> = {
  D: 30,
  W: 90,
  M: 180,
  '3M': 270,
  Y: 365,
};

export default function EquityCurveChart({ data }: EquityCurveChartProps) {
  const [range, setRange] = useState<TimeRange>('M');

  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return data.filter((d) => d.date >= cutoffStr);
  }, [data, range]);

  const ranges: TimeRange[] = ['D', 'W', 'M', '3M', 'Y'];

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Account Balance</h3>
        <div className="flex items-center gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                range === r
                  ? 'bg-primary/20 text-primary-400 border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-navy-600/50'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {filteredData.length >= 2 ? (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickFormatter={(v: number) => `£${(v / 1000).toFixed(1)}k`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#f1f5f9',
                fontSize: '12px',
              }}
              formatter={(value: number) => [`£${value.toFixed(2)}`, 'Equity']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#equityFill)"
              dot={false}
              activeDot={{ r: 4, fill: '#6366f1' }}
            />
            {filteredData.length > 30 && (
              <Brush
                dataKey="date"
                height={24}
                stroke="rgba(99,102,241,0.4)"
                fill="#0f172a"
                tickFormatter={(v: string) => v.slice(5)}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Not enough data to render chart. Run the nightly pipeline to build equity history.
        </div>
      )}
    </div>
  );
}
