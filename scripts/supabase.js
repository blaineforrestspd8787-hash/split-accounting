/**
 * supabase.js — Supabase 云端存储封装
 * 登录鉴权 + 数据同步（REST API 直调，无外部依赖）
 *
 * 数据流向：localStorage 为本地缓存，Supabase 为云端持久层
 * 写入策略：localStorage 先写（即时）→ Supabase 后写（异步）
 * 启动策略：缓存数据即时展示 → 后台从 Supabase 拉取最新并合并
 */

const SUPABASE_URL = 'https://srvsaoigjjlpjawkzihe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNydnNhb2lnampscGphd2t6aWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjUzOTQsImV4cCI6MjA5Njc0MTM5NH0.9pQyiP2ASDb5MkbquJea1LUNTHXCQNkNiNycGt0VqR0';

/* ========================================
   内部工具
   ======================================== */

function _headers() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

function _api(path) {
  return `${SUPABASE_URL}/rest/v1/${path}`;
}

/** 当前登录的账本信息（内存镜像） */
let _currentLedger = null;

/* ========================================
   登录 / 注册
   ======================================== */

/**
 * 登录已有账本，或创建新账本
 * @param {string} name - 账本名称
 * @param {string} password - 密码
 * @returns {Promise<{id: number, name: string, settings: object}>}
 */
async function supabaseLogin(name, password) {
  name = name.trim();
  if (!name || !password) throw new Error('请输入账本名称和密码');

  // 1. 查找同名账本
  const res = await fetch(_api(`ledgers?name=eq.${encodeURIComponent(name)}&select=*`), {
    headers: _headers(),
  });
  if (!res.ok) throw new Error('网络错误，请检查网络连接');

  const list = await res.json();

  if (list.length > 0) {
    // 账本存在 → 验证密码
    const row = list[0];
    if (row.password !== password) throw new Error('密码错误');
    _currentLedger = {
      id: row.id,
      name: row.name,
      settings: row.settings || { splitPercentage: 30 },
    };
    return _currentLedger;
  }

  // 2. 不存在 → 创建新账本
  const createRes = await fetch(_api('ledgers'), {
    method: 'POST',
    headers: { ..._headers(), 'Prefer': 'return=representation' },
    body: JSON.stringify({
      name,
      password,
      settings: { splitPercentage: 30 },
    }),
  });
  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    // 唯一约束冲突 → 说明并发创建，让用户再试一次
    if (errBody.code === '23505') throw new Error('该账本名已被注册，请换一个名称');
    throw new Error('创建账本失败，请重试');
  }

  const created = await createRes.json();
  _currentLedger = {
    id: created.id,
    name: created.name,
    settings: created.settings || { splitPercentage: 30 },
  };
  return _currentLedger;
}

/** 获取当前内存中的账本信息 */
function supabaseGetCurrentLedger() {
  return _currentLedger;
}

/** 从 localStorage 恢复账本信息到内存 */
function supabaseRestoreLedger(info) {
  if (info && info.id) _currentLedger = info;
}

/** 清除内存中的账本信息 */
function supabaseClearLedger() {
  _currentLedger = null;
}

/* ========================================
   记录同步
   ======================================== */

/** 从云端拉取某个账本的全部记录 */
async function supabaseFetchRecords(ledgerId) {
  const res = await fetch(
    _api(`records?ledger_id=eq.${ledgerId}&order=date.desc`),
    { headers: _headers() }
  );
  if (!res.ok) throw new Error('获取云端记录失败');
  const rows = await res.json();

  // 将 Supabase 返回的 snake_case → 应用的 camelCase
  return rows.map(r => ({
    id: r.id,
    date: r.date,
    totalIncome: parseFloat(r.total_income),
    profit: parseFloat(r.profit),
    partnerShare: parseFloat(r.partner_share),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** 单条记录 upsert（写入本地后再调用） */
async function supabaseUpsertRecord(ledgerId, record) {
  const body = {
    id: record.id,
    ledger_id: ledgerId,
    date: record.date,
    total_income: record.totalIncome,
    profit: record.profit,
    partner_share: record.partnerShare,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
  const res = await fetch(_api('records'), {
    method: 'POST',
    headers: { ..._headers(), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('同步记录到云端失败');
}

/** 批量 upsert 所有本地记录到云端 */
async function supabaseUpsertAllRecords(ledgerId, records) {
  if (!records.length) return;
  const body = records.map(r => ({
    id: r.id,
    ledger_id: ledgerId,
    date: r.date,
    total_income: r.totalIncome,
    profit: r.profit,
    partner_share: r.partnerShare,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }));
  const res = await fetch(_api('records'), {
    method: 'POST',
    headers: { ..._headers(), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('批量同步到云端失败');
}

/** 从云端删除一条记录 */
async function supabaseDeleteRecord(ledgerId, recordId) {
  const res = await fetch(
    _api(`records?id=eq.${encodeURIComponent(recordId)}&ledger_id=eq.${ledgerId}`),
    { method: 'DELETE', headers: _headers() }
  );
  if (!res.ok) throw new Error('从云端删除记录失败');
}

/** 获取账本信息（含 settings） */
async function supabaseFetchLedger(ledgerId) {
  const res = await fetch(
    _api(`ledgers?id=eq.${ledgerId}&select=*`),
    { headers: _headers() }
  );
  if (!res.ok) throw new Error('获取账本信息失败');
  const data = await res.json();
  if (data.length === 0) return null;
  const row = data[0];
  return {
    id: row.id,
    name: row.name,
    settings: row.settings || { splitPercentage: 30 },
  };
}

/* ========================================
   设置同步
   ======================================== */

/** 将分成比例同步到云端（存到 ledgers 表的 settings 字段） */
async function supabaseUpdateSettings(ledgerId, settings) {
  const res = await fetch(_api(`ledgers?id=eq.${ledgerId}`), {
    method: 'PATCH',
    headers: _headers(),
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) throw new Error('同步设置到云端失败');

  // 同步内存镜像
  if (_currentLedger && _currentLedger.id === ledgerId) {
    _currentLedger.settings = settings;
  }
}
