#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/61c68d5e567152c5a39f38dfe7036fc9b83ccd8b5cf5d5752deb80c8958f78ef/contract';
import startContract from '../../snapshots/61c68d5e567152c5a39f38dfe7036fc9b83ccd8b5cf5d5752deb80c8958f78ef/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d4ed62f9053c00217c38841bbc4f80d418e26c12c0863e2d3cff737a2e999751/contract';
import endContract from '../../snapshots/d4ed62f9053c00217c38841bbc4f80d418e26c12c0863e2d3cff737a2e999751/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'notificacao_campanha',
        columns: [
          col('campanhaId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('conteudoCifrado', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('criadaEm', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('disponivelEm', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('enviadaEm', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('tentativas', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('tipo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha',
        column: col('chaveIdempotencia', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha',
        column: col('executorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha',
        column: col('expiraEm', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha',
        column: col('hashSolicitacao', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha',
        column: col('hashTokenRelatorio', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha',
        column: col('idPublico', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha',
        column: col('temporaria', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha',
        column: col('tokenEnvioCifrado', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha',
        column: col('ultimoSinalEm', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha_contato',
        column: col('nome', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'campanha_contato',
        column: col('telefone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'instancia',
        column: col('temporaria', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.dropNotNull({ schema: 'public', table: 'campanha_contato', column: 'contatoId' }),
      this.addUnique({
        schema: 'public',
        table: 'campanha',
        constraint: 'campanha_chaveIdempotencia_key',
        columns: ['chaveIdempotencia'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'campanha',
        constraint: 'campanha_idPublico_key',
        columns: ['idPublico'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'campanha_contato',
        constraint: 'campanha_contato_campanhaId_telefone_key',
        columns: ['campanhaId', 'telefone'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'notificacao_campanha',
        constraint: 'notificacao_campanha_campanhaId_tipo_key',
        columns: ['campanhaId', 'tipo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campanha',
        index: 'campanha_expiraEm_idx_775818ab',
        columns: ['expiraEm'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'notificacao_campanha',
        index: 'notificacao_campanha_campanhaId_idx_6cd07fa5',
        columns: ['campanhaId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'notificacao_campanha',
        index: 'notificacao_campanha_disponivelEm_idx_83801283',
        columns: ['disponivelEm'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notificacao_campanha',
        foreignKey: {
          name: 'notificacao_campanha_campanhaId_fkey',
          columns: ['campanhaId'],
          references: { schema: 'public', table: 'campanha', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
