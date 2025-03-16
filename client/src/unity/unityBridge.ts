/**
 * @typedef {import('global')}
 */

export const sendJSBuffer = (arr: ArrayBuffer): void => {
  if (!window.sendJSBuffer) {
    console.warn("Not wired for sendJSBuffer");
    return;
  }
  return window.sendJSBuffer(arr);
};


export const callUnityMethod = (type: number, payload: object | string): string => {
  if (!window.callUnityMethod) {
    console.warn("Not wired for callUnityMethod");
    return "";
  }
  if (typeof payload === 'object') {
    payload = JSON.stringify(payload);
  }
  return window.callUnityMethod(type, payload);
};
