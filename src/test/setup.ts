/**
 * Vitest global setup: registers jest-dom matchers (toBeInTheDocument, etc.)
 * and clears the rendered DOM between tests.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
