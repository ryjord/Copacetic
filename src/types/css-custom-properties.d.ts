import 'react';

// Custom properties in a style prop, so a colour can be handed to the stylesheet without a cast.
declare module 'react' {
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
