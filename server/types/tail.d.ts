declare module "tail" {
  export type TailOptions = {
    follow?: boolean;
    useWatchFile?: boolean;
    fsWatchOptions?: {
      interval?: number;
    };
    [key: string]: unknown;
  };

  export class Tail {
    constructor(path: string, options?: TailOptions);
    on(event: "line", callback: (line: string) => void): this;
    on(event: "error", callback: (error: unknown) => void): this;
    unwatch(): void;
  }
}

