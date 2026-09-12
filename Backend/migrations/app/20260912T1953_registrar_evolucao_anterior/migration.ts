#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2cecb585e4d35a2ea646d9784285bf4cdfb970b38fe895ab7453ad601455366d/contract';
import endContract from '../../snapshots/2cecb585e4d35a2ea646d9784285bf4cdfb970b38fe895ab7453ad601455366d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ed447f697fbec6f916dcc225f4adca806a298e23740151071d6e3c27979595c8/contract';
import startContract from '../../snapshots/ed447f697fbec6f916dcc225f4adca806a298e23740151071d6e3c27979595c8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropIndex({
        schema: 'public',
        table: 'contato',
        index: 'contato_telefone_idx_15d68930',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'mensagem',
        constraint: 'mensagem_tipo_check_46a9b4c2',
      }),
      this.addColumn({
        schema: 'public',
        table: 'mensagem',
        column: col('idMidia', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.setDefault({
        schema: 'public',
        table: 'instancia',
        column: 'atualizadoEm',
        defaultSql: 'DEFAULT (now())',
      }),
      this.addUnique({
        schema: 'public',
        table: 'contato',
        constraint: 'contato_telefone_key',
        columns: ['telefone'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'mensagem',
        constraint: 'mensagem_tipo_check_52a1ae30',
        expression: "\"tipo\" IN ('texto', 'link', 'imagem', 'video', 'audio')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
