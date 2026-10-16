import { stir } from './stir.js';

// Simulates a stirring off the main thread and hands the recording back
self.onmessage = ({ data: { cols, rows } }) => {
  const record = stir(cols, rows);
  self.postMessage({ record, cols, rows }, [record.buffer]);
};
