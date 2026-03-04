import type * as React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "kkiapay-widget": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        amount?: string | number;
        key?: string;
        callback?: string;
        sandbox?: string | boolean;
        data?: string;
      };
    }
  }
}

export {};

