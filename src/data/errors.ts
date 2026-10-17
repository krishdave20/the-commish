/* One error type for everything the data layer can throw, so the UI can branch on `kind`
   instead of parsing messages. */
export type DataErrorKind = 'not_found' | 'network' | 'http' | 'shape';

export class DataError extends Error {
  kind: DataErrorKind;
  url?: string;
  status?: number;
  constructor(kind: DataErrorKind, message: string, extra?: { url?: string; status?: number }) {
    super(message);
    this.name = 'DataError';
    this.kind = kind;
    this.url = extra?.url;
    this.status = extra?.status;
  }
}
