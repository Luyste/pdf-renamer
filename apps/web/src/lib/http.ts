/** Thrown by apiFetch for any non-ok response. Carries the requestId the
 * worker logged this request under, so it can be shown to the user and
 * matched against Workers Logs / container logs for that one request. */
export class ApiError extends Error {
  status: number;
  requestId: string | undefined;

  constructor(message: string, status: number, requestId: string | undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
  }
}

/** fetch() wrapper that stamps every request with a correlation id (sent
 * as X-Request-Id, echoed back by the worker) and turns non-ok responses
 * into an ApiError carrying that id. */
export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = new Headers(init?.headers);
  headers.set('X-Request-Id', requestId);

  const res = await fetch(input, { ...init, headers });
  if (!res.ok) {
    const returnedId = res.headers.get('X-Request-Id') ?? requestId;
    throw new ApiError(
      `${input} failed: ${res.status}`,
      res.status,
      returnedId,
    );
  }
  return res;
}
