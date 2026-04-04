'use client';

import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  ComposedChart,
  Brush,
  Cell,
} from 'recharts';

interface RMultipleMonthRow {
  month: string; // YYYY-MM
  avgR: number;
  totalR: number;
  tradeCount: number;
}

interface RMultipleBarChartProps {
  data: RMultipleMonthRow[];
}

type TimeRange = 'M' | '3M' | 'Y';

const RANGE_MONTHS: Record<TimeRange, number> = {
  M: 6,
  '3M': 12,
  Y: 24,
};

export default function RMultipleBarChart({ data }: RMultipleBarChartProps) {
  const [range, setRange] = useState<TimeRange>('M');

  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - RANGE_MONTHS[range]);
    const cutoffStr = cutoff.toISOString().slice(0, 7);
    return data.filter((d) => d.month >= cutoffStr);
  }, [data, range]);

  const ranges: TimeRange[] = ['M', '3M', 'Y'];

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Reward:Risk</h3>
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

      {filteredData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="month"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickFormatter={(v: string) => {
                const [, m] = v.split('-');
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                return months[parseInt(m, 10) - 1] ?? v;
              }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickFormatter={(v: number) => `${v.toFixed(1)} R:R`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#f1f5f9',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => [
                `${value.toFixed(2)} R`,
                name === 'avgR' ? 'Avg R' : 'Total R',
              ]}
            />
            <Bar dataKey="avgR" name="avgR" radius={[3, 3, 0, 0]}>
              {filteredData.map((entry, i) => (
                <Cell key={i} fill={entry.avgR >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.7} />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="totalR"
              name="totalR"
              stroke="#94a3b8"
              strokeWidth={1.5}
              dot={{ r: 3, fill: '#94a3b8' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No R-multiple data yet. Complete some trades to see reward:risk distribution.
        </div>
      )}
    </div>
  );
}
