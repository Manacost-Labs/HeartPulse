/** The release the client bundle was built for; `development` outside a release build. */
declare const __APP_RELEASE_SHA__: string;

/** A stylesheet is imported for its side effect; a lazy `import()` of one resolves to an empty module. */
declare module '*.css' {}
