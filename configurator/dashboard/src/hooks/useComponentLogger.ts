// SPDX-License-Identifier: MIT
/**
 * useComponentLogger Hook
 *
 * Returns a logger instance prefixed with the component name.
 * Automatically includes component lifecycle information.
 */

import { useEffect, useMemo } from 'react';
import { getLogger, type Logger } from '../utils/logger';

interface ComponentLoggerOptions {
  logMount?: boolean;
  logUnmount?: boolean;
}

/**
 * Create a logger for a React component
 *
 * @param componentName - Name of the component
 * @param options - Logging options
 * @returns Logger instance
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const log = useComponentLogger('MyComponent');
 *
 *   useEffect(() => {
 *     log.info('Data loaded', { count: data.length });
 *   }, [data]);
 *
 *   const handleClick = () => {
 *     log.debug('Button clicked');
 *   };
 * }
 * ```
 */
export function useComponentLogger(
  componentName: string,
  options: ComponentLoggerOptions = {}
): Logger {
  const { logMount = true, logUnmount = true } = options;

  // Create logger with component name prefix
  const logger = useMemo(() => {
    return getLogger(`Component/${componentName}`);
  }, [componentName]);

  // Log mount and unmount
  useEffect(() => {
    if (logMount) {
      logger.debug(`Mounted`);
    }

    return () => {
      if (logUnmount) {
        logger.debug(`Unmounting`);
      }
    };
  }, [logger, logMount, logUnmount]);

  return logger;
}

/**
 * Create a logger for a component without lifecycle logging
 *
 * @param componentName - Name of the component
 * @returns Logger instance
 */
export function useComponentLoggerQuiet(componentName: string): Logger {
  return useComponentLogger(componentName, {
    logMount: false,
    logUnmount: false,
  });
}
