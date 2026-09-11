import { AxiosError } from 'axios';

/**
 * Pulls a message out of whatever a failed call threw.
 *
 * Replaces the `catch (e: any)` / `e.response?.data?.message` pattern that was
 * repeated across the app: `any` silenced the compiler on a value that is
 * genuinely unknown, and the chain broke on anything that was not an Axios error.
 */
export function getErrorMessage(error: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    const message = data?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (message) return message;
    return error.message || fallback;
  }

  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string' && error) return error;

  return fallback;
}
