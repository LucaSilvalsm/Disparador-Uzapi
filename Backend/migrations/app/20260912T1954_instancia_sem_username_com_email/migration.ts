#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2cecb585e4d35a2ea646d9784285bf4cdfb970b38fe895ab7453ad601455366d/contract';
import startContract from '../../snapshots/2cecb585e4d35a2ea646d9784285bf4cdfb970b38fe895ab7453ad601455366d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/61c68d5e567152c5a39f38dfe7036fc9b83ccd8b5cf5d5752deb80c8958f78ef/contract';
import endContract from '../../snapshots/61c68d5e567152c5a39f38dfe7036fc9b83ccd8b5cf5d5752deb80c8958f78ef/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropColumn({ schema: 'public', table: 'instancia', column: 'usuarioUzapi' }),
      this.addColumn({
        schema: 'public',
        table: 'instancia',
        column: col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
