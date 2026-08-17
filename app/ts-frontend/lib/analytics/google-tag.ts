export type GoogleTagFunction = (...args: unknown[]) => void;

export function createGoogleTagQueue(dataLayer: unknown[]): GoogleTagFunction {
  return function gtag(..._args: unknown[]) {
    // gtag.js expects its command queue entries to be the function's
    // Arguments object. A rest-parameter array is not processed as a command.
    dataLayer.push(arguments);
  };
}
