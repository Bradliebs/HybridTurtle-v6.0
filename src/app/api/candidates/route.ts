import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseQueryParams } from '@/lib/request-validation';
import { apiError } from '@/lib/api-response';
import { getCandidateListView } from '../../../../packages/signals/src';

const VALID_SORT_FIELDS = ['symbol', 'currentPrice', 'triggerPrice', 'stopDistancePercent', 'setupStatus', 'rankScore'] as const;

const candidatesQuerySchema = z.object({
  sortBy: z.enum(VALID_SORT_FIELDS).optional().default('rankScore'),
  direction: z.enum(['asc', 'desc']).optional().default('desc'),
});

export async function GET(request: NextRequest) {
  try {
    const qv = parseQueryParams(request, candidatesQuerySchema);
    if (!qv.ok) return qv.response;

    const { sortBy, direction } = qv.data;
    const result = await getCandidateListView(sortBy, direction);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(500, 'CANDIDATES_FAILED', 'Failed to load candidates', (error as Error).message);
  }
}