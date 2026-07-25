declare module '@requiem-subapp/libra' {
  export const LibraApp: import('react').ComponentType;
}

declare module '@requiem-subapp/sandbox' {
  export type SandboxAppProps = {
    basePath?: string;
  };

  export const SandboxApp: import('react').ComponentType<SandboxAppProps>;
}
