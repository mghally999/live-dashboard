type Fields = Readonly<Record<string, number>>;

// Silent in production builds and tests. Fields are numeric only, so a payload or token cannot be logged by accident.
const enabled = !import.meta.env.PROD && import.meta.env.MODE !== 'test';

function write(level: 'info' | 'warn' | 'error', message: string, fields?: Fields): void {
  if (!enabled) return;
  if (fields) console[level](`[live] ${message}`, fields);
  else console[level](`[live] ${message}`);
}

export const logger = {
  info: (message: string, fields?: Fields) => { write('info', message, fields); },
  warn: (message: string, fields?: Fields) => { write('warn', message, fields); },
  error: (message: string, fields?: Fields) => { write('error', message, fields); },
};
