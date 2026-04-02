import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ensureDefaultUser } from '@/lib/default-user';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';

export const dynamic = 'force-dynamic';

interface PublicationItem {
  date: string;
  title: string;
  type: 'summary' | 'scan' | 'alert' | 'trade';
}

const publicationsGetSchema = z.object({
  userId: z.string().max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const qv = parseQueryParams(request, publicationsGetSchema);
    if (!qv.ok) return qv.response;

    let userId = qv.data.userId ?? null;

    if (!userId) {
      userId = await ensureDefaultUser();
    }

    const [latestHealth, latestHeartbeat, latestStop, latestPosition] = await Promise.all([
      prisma.healthCheck.findFirst({
        where: { userId },
        orderBy: { runDate: 'desc' },
      }),
      prisma.heartbeat.findFirst({
        orderBy: { timestamp: 'desc' },
      }),
      prisma.stopHistory.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { position: { include: { stock: { select: { ticker: true } } } } },
      }),
      prisma.position.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { stock: { select: { ticker: true } } },
      }),
    ]);

    const publications: Array<{ date: Date; item: PublicationItem }> = [];

    if (latestHeartbeat) {
      publications.push({
        date: latestHeartbeat.timestamp,
        item: {
          date: latestHeartbeat.timestamp.toISOString(),
          title: `Nightly Summary — ${latestHeartbeat.status}`,
          type: 'summary',
        },
      });
    }

    if (latestHealth) {
      publications.push({
        date: latestHealth.runDate,
        item: {
          date: latestHealth.runDate.toISOString(),
          title: `Health Check — ${latestHealth.overall}`,
          type: 'summary',
        },
      });
    }

    if (latestStop?.position?.stock) {
      publications.push({
        date: latestStop.createdAt,
        item: {
          date: latestStop.createdAt.toISOString(),
          title: `Stop-loss updated: ${latestStop.position.stock.ticker}`,
          type: 'alert',
        },
      });
    }

    if (latestPosition?.stock) {
      const verb = latestPosition.status === 'CLOSED' ? 'Position closed' : 'Position opened';
      publications.push({
        date: latestPosition.createdAt,
        item: {
          date: latestPosition.createdAt.toISOString(),
          title: `${verb}: ${latestPosition.stock.ticker}`,
          type: 'trade',
        },
      });
    }

    const sorted = publications
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 6)
      .map((entry) => entry.item);

    return NextResponse.json({ publications: sorted });
  } catch (error) {
    console.error('Publications fetch error:', error);
    return apiError(500, 'PUBLICATIONS_FETCH_FAILED', 'Failed to fetch publications', (error as Error).message, true);
  }
}
