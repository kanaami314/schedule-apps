-- ============================================================================
-- くるリズム バックエンド初期スキーマ（Supabase / PostgreSQL）
--
-- 設計方針:
--  - 1アカウント = auth.users の1行。全データは user_id で完全分離。
--  - データ分離（＝アカウント間の独立性）は Row Level Security (RLS) でDB側から強制。
--    アプリのバグや不正リクエストがあっても、他人のデータには一切アクセスできない。
--  - 各ドメインコレクション（categories / definitions / ...）は
--    (user_id, id, data jsonb, version, updated_at) の共通スキーマ。
--    data はドメインオブジェクト（判別可能ユニオン等）をそのまま JSONB で保持する
--    （アプリはユーザー単位で全件読み込み→クライアントで計算する既存方式に合わせる）。
--  - 書き込みは put_row() 経由の「単一文の upsert」で原子的（トランザクション分離は自明に担保）。
--  - 端末間の更新競合（lost update）は version による楽観的並行制御で検出する
--    （期待versionと不一致なら 40001 を投げ、クライアントは再取得してやり直す）。
--  - さらに厳密な複数行トランザクション（SERIALIZABLE）が必要な処理が出た場合は、
--    Edge Function で明示的に BEGIN ISOLATION LEVEL SERIALIZABLE + 40001リトライを行う
--    （現状のアプリの書き込みは単一行 upsert が中心のため未使用。将来拡張の口として記載）。
-- ============================================================================

-- ---- 共通テーブル群を生成（8コレクション） ----------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'categories', 'definitions', 'projects', 'goals',
    'tags', 'wishlist', 'records', 'reflections'
  ];
begin
  foreach t in array tables loop
    execute format($f$
      create table if not exists public.%1$I (
        user_id    uuid        not null default auth.uid()
                     references auth.users(id) on delete cascade,
        id         text        not null,
        data       jsonb       not null,
        version    integer     not null default 1,
        updated_at timestamptz not null default now(),
        primary key (user_id, id)
      );
    $f$, t);

    -- RLS 有効化（デフォルト拒否）。
    execute format('alter table public.%1$I enable row level security;', t);

    -- 自分の行だけ全操作可（select/insert/update/delete）。他人の行は不可視。
    execute format('drop policy if exists %1$I on public.%2$I;', t || '_owner', t);
    execute format($f$
      create policy %1$I on public.%2$I
        for all
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    $f$, t || '_owner', t);
  end loop;
end $$;

-- ---- 書き込み: 楽観的並行制御つき原子的 upsert -------------------------------
-- p_expected_version:
--   - null           … バージョン確認なしで upsert（新規作成や強制上書き）
--   - 整数           … 既存行の version と一致する場合のみ更新（不一致は 40001）
-- 戻り値: 更新後の version。
create or replace function public.put_row(
  p_table            text,
  p_id               text,
  p_data             jsonb,
  p_expected_version integer default null
) returns integer
language plpgsql
security invoker      -- 呼び出し元の権限で実行 → RLS がそのまま効く
set search_path = public
as $$
declare
  v_new integer;
begin
  if p_table not in (
    'categories', 'definitions', 'projects', 'goals',
    'tags', 'wishlist', 'records', 'reflections'
  ) then
    raise exception 'invalid table: %', p_table using errcode = '22023';
  end if;

  execute format(
    'insert into public.%1$I as t (user_id, id, data, version, updated_at) '
    'values (auth.uid(), $1, $2, 1, now()) '
    'on conflict (user_id, id) do update '
    '  set data = excluded.data, version = t.version + 1, updated_at = now() '
    '  where ($3 is null or t.version = $3) '
    'returning version', p_table)
  into v_new
  using p_id, p_data, p_expected_version;

  -- 競合（期待versionと不一致で更新0件）→ シリアライズ失敗として通知。
  if v_new is null then
    raise exception 'version conflict on %.%', p_table, p_id
      using errcode = '40001';
  end if;

  return v_new;
end;
$$;

-- ---- 一括投入（初期カテゴリ seed 用）: 各行を put_row で upsert ---------------
-- rows は [{ "id": "...", "data": {...} }, ...] の JSONB 配列。
create or replace function public.bulk_put(
  p_table text,
  p_rows  jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    perform public.put_row(p_table, r->>'id', r->'data', null);
  end loop;
end;
$$;
