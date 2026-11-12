declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(
      path: string,
      options?: { readOnly?: boolean; enableForeignKeys?: boolean; timeout?: number },
    );
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export class StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
}
