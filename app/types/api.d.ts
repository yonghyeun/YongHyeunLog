export type QueryParameter = Record<string, string>;
export type Header = Record<string, string>;
export type RequestOptions = {
  additionalHeader?: Header;
  queryParameter?: QueryParameter;
  body?: any;
};
export type HTTPResponse<T> = {
  status: number;
  data: T;
};

export type Issue = {
  id: number;
  number: number;
  title: string;
  body: string;
  comments: number;
  reactions: Record<string, number>;
};