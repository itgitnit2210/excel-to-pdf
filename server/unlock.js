import { Worker } from 'node:worker_threads';
export function unlockWorkbook(file, password = '') {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./unlock-worker.js', import.meta.url), { workerData: { file, password }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    let finished = false;
    const timer = setTimeout(() => finish(new Error('Opening the workbook timed out. Its encryption may be unsupported.')), 30000);
    function finish(error, value) {
      if (finished) return;
      finished = true; clearTimeout(timer);
      // Wait for termination before the request deletes its temporary directory.
      worker.terminate().then(() => error ? reject(error) : resolve(value), reject);
    }
    worker.on('message', result => result.error ? finish(Object.assign(new Error(result.error), { code: result.code })) : finish(null, result));
    worker.on('error', () => finish(new Error('Unable to open the workbook within the available resources.')));
    worker.on('exit', code => { if (!finished) finish(new Error(`Workbook reader stopped unexpectedly (${code}).`)); });
  });
}
