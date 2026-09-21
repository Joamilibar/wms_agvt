import { HttpException } from '@nestjs/common';

/** The structured `details` a BadRequestException of this module carries, or the message when there is none. */
export function getErrorDetails(e: unknown): Record<string, unknown> {
  if (e instanceof HttpException) {
    const r = e.getResponse();
    if (typeof r === 'object' && r !== null && 'details' in r) return (r as { details: Record<string, unknown> }).details;
    return { code: 'ERROR', message: typeof r === 'string' ? r : (r as { message?: string }).message ?? e.message };
  }
  return { code: 'ERROR', message: (e as Error).message };
}
