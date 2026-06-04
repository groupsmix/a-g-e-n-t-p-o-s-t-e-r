/**
 * API Client type definitions
 * 
 * This file defines the APIClient interface with typed HTTP methods
 * to replace `as any` casts throughout the web application.
 */

/**
 * Generic API client interface with typed HTTP methods
 * 
 * @example
 * const client: APIClient = {
 *   get: <T>(path: string) => fetch(path).then(r => r.json() as T),
 *   post: <T>(path: string, body: unknown) => fetch(path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json() as T),
 *   // ... other methods
 * }
 */
export interface APIClient {
  /**
   * Perform a GET request
   * @param path - API endpoint path
   * @returns Promise resolving to the typed response
   */
  get<T>(path: string): Promise<T>

  /**
   * Perform a POST request
   * @param path - API endpoint path
   * @param body - Request body data
   * @returns Promise resolving to the typed response
   */
  post<T>(path: string, body: unknown): Promise<T>

  /**
   * Perform a PATCH request
   * @param path - API endpoint path
   * @param body - Request body data
   * @returns Promise resolving to the typed response
   */
  patch<T>(path: string, body: unknown): Promise<T>

  /**
   * Perform a PUT request
   * @param path - API endpoint path
   * @param body - Request body data
   * @returns Promise resolving to the typed response
   */
  put<T>(path: string, body: unknown): Promise<T>

  /**
   * Perform a DELETE request
   * @param path - API endpoint path
   * @returns Promise resolving to the typed response
   */
  delete<T>(path: string): Promise<T>
}

/**
 * Extended API client interface that includes all specific API methods
 * This interface can be used to type the full api object from @/lib/api
 */
export interface ExtendedAPIClient extends APIClient {
  // Add specific method signatures here as needed
  // This allows for both generic HTTP methods and specific API methods
  [key: string]: (...args: any[]) => Promise<any>
}
