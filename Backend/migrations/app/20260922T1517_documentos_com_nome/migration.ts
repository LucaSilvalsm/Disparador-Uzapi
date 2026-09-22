#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a59dde29a5fe22cd48874ad67f238a07fd88b43da1d462e41fd42b643790dd1d/contract';
import endContract from '../../snapshots/a59dde29a5fe22cd48874ad67f238a07fd88b43da1d462e41fd42b643790dd1d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d4ed62f9053c00217c38841bbc4f80d418e26c12c0863e2d3cff737a2e999751/contract';
import startContract from '../../snapshots/d4ed62f9053c00217c38841bbc4f80d418e26c12c0863e2d3cff737a2e999751/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'mensagem',
        constraint: 'mensagem_tipo_check_52a1ae30',
      }),
      this.addColumn({
        schema: 'public',
        table: 'mensagem',
        column: col('nomeArquivo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'mensagem',
        constraint: 'mensagem_tipo_check_df7a41b0',
        expression: "\"tipo\" IN ('texto', 'link', 'imagem', 'video', 'audio', 'documento')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
