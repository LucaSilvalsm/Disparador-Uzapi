#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/ed447f697fbec6f916dcc225f4adca806a298e23740151071d6e3c27979595c8/contract';
import endContract from '../../snapshots/ed447f697fbec6f916dcc225f4adca806a298e23740151071d6e3c27979595c8/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'campanha',
        columns: [
          col('criadaEm', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('emailRelatorio', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('finalizadaEm', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('hashTokenAcesso', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('iniciadaEm', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('instanciaId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nome', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('rascunho'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'campanha_status_check_8e114037',
            "\"status\" IN ('rascunho', 'em_andamento', 'pausada', 'concluida', 'cancelada', 'falhou')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'campanha_contato',
        columns: [
          col('campanhaId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('contatoId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('criadoEm', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('finalizadoEm', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('iniciadoEm', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pendente'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'campanha_contato_status_check_5cb3fc7e',
            "\"status\" IN ('pendente', 'processando', 'concluido', 'parcial', 'falhou')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'contato',
        columns: [
          col('criadoEm', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nome', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('telefone', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'instancia',
        columns: [
          col('ativo', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('atualizadoEm', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('criadoEm', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('idNumeroTelefone', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('limiteDiarioContatos', 'int4', {
            notNull: true,
            default: lit(250),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('nome', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('token', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usuarioUzapi', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mensagem',
        columns: [
          col('campanhaId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('criadaEm', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('posicao', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('texto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tipo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('urlMidia', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'mensagem_tipo_check_46a9b4c2',
            "\"tipo\" IN ('texto', 'imagem', 'audio')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'resultado_mensagem',
        columns: [
          col('campanhaContatoId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('criadaEm', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('enviadaEm', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('erro', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('idFila', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('idMensagem', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('mensagemId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pendente'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'resultado_mensagem_status_check_9a74aed8',
            "\"status\" IN ('pendente', 'sucesso', 'falhou')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'campanha_contato',
        constraint: 'campanha_contato_campanhaId_contatoId_key',
        columns: ['campanhaId', 'contatoId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'instancia',
        constraint: 'instancia_idNumeroTelefone_key',
        columns: ['idNumeroTelefone'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'mensagem',
        constraint: 'mensagem_campanhaId_posicao_key',
        columns: ['campanhaId', 'posicao'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'resultado_mensagem',
        constraint: 'resultado_mensagem_mensagemId_campanhaContatoId_key',
        columns: ['mensagemId', 'campanhaContatoId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campanha',
        index: 'campanha_instanciaId_idx_00db4b25',
        columns: ['instanciaId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campanha',
        index: 'campanha_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campanha_contato',
        index: 'campanha_contato_campanhaId_idx_6cd07fa5',
        columns: ['campanhaId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campanha_contato',
        index: 'campanha_contato_contatoId_idx_55ea5573',
        columns: ['contatoId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campanha_contato',
        index: 'campanha_contato_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'contato',
        index: 'contato_telefone_idx_15d68930',
        columns: ['telefone'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mensagem',
        index: 'mensagem_campanhaId_idx_6cd07fa5',
        columns: ['campanhaId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'resultado_mensagem',
        index: 'resultado_mensagem_campanhaContatoId_idx_8a35d7f8',
        columns: ['campanhaContatoId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'resultado_mensagem',
        index: 'resultado_mensagem_mensagemId_idx_fa67b8b9',
        columns: ['mensagemId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'resultado_mensagem',
        index: 'resultado_mensagem_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'campanha',
        foreignKey: {
          name: 'campanha_instanciaId_fkey',
          columns: ['instanciaId'],
          references: { schema: 'public', table: 'instancia', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'campanha_contato',
        foreignKey: {
          name: 'campanha_contato_campanhaId_fkey',
          columns: ['campanhaId'],
          references: { schema: 'public', table: 'campanha', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'campanha_contato',
        foreignKey: {
          name: 'campanha_contato_contatoId_fkey',
          columns: ['contatoId'],
          references: { schema: 'public', table: 'contato', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mensagem',
        foreignKey: {
          name: 'mensagem_campanhaId_fkey',
          columns: ['campanhaId'],
          references: { schema: 'public', table: 'campanha', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'resultado_mensagem',
        foreignKey: {
          name: 'resultado_mensagem_mensagemId_fkey',
          columns: ['mensagemId'],
          references: { schema: 'public', table: 'mensagem', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'resultado_mensagem',
        foreignKey: {
          name: 'resultado_mensagem_campanhaContatoId_fkey',
          columns: ['campanhaContatoId'],
          references: { schema: 'public', table: 'campanha_contato', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
