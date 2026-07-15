/**
 * storage.js — localStorage 封装
 * 负责所有数据的 CRUD 操作和初始化
 */

const KEYS = {
  RECORDS: 'incomeRecords',
  OTHER_RECORDS: 'otherRecords',
  SETTINGS: 'splitSettings',
  LEDGER_INFO: 'ledgerInfo'
};

const DEFAULT_SETTINGS = {
  splitPercentage: 30
};

/**
 * 初始化存储（首次使用时创建默认数据）
 */
function initStorage() {
  if (!localStorage.getItem(KEYS.RECORDS)) {
    localStorage.setItem(KEYS.RECORDS, JSON.stringify([]));
  }
  if (!localStorage.getItem(KEYS.OTHER_RECORDS)) {
    localStorage.setItem(KEYS.OTHER_RECORDS, JSON.stringify([]));
  }
  if (!localStorage.getItem(KEYS.SETTINGS)) {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
  }
}

/**
 * 获取所有收入记录
 * @returns {Array}
 */
function getRecords() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.RECORDS)) || [];
  } catch {
    return [];
  }
}

/**
 * 保存所有收入记录
 * @param {Array} records
 */
function saveRecords(records) {
  localStorage.setItem(KEYS.RECORDS, JSON.stringify(records));
}

/**
 * 根据日期查找记录
 * @param {string} date - "YYYY-MM-DD"
 * @returns {object|null}
 */
function getRecordByDate(date) {
  const records = getRecords();
  return records.find(r => r.date === date) || null;
}

/**
 * 根据 ID 查找记录
 * @param {string} id
 * @returns {object|null}
 */
function getRecordById(id) {
  const records = getRecords();
  return records.find(r => r.id === id) || null;
}

/**
 * 新增记录
 * @param {object} record
 */
function addRecord(record) {
  const records = getRecords();
  records.push(record);
  saveRecords(records);
}

/**
 * 更新指定 ID 记录的总收入，自动重算 profit 和 partnerShare
 * @param {string} id
 * @param {number} newIncome
 * @param {number} ratio - 分成比例（百分比）
 */
function updateRecord(id, newIncome, ratio) {
  const records = getRecords();
  const idx = records.findIndex(r => r.id === id);
  if (idx === -1) return false;

  records[idx].totalIncome = newIncome;
  records[idx].profit = calcRound(newIncome * (1 - ratio / 100));
  records[idx].partnerShare = calcRound(newIncome * (ratio / 100));
  records[idx].updatedAt = new Date().toISOString();
  saveRecords(records);
  return true;
}

/**
 * 删除记录
 * @param {string} id
 */
function deleteRecord(id) {
  const records = getRecords();
  const filtered = records.filter(r => r.id !== id);
  if (filtered.length === records.length) return false;
  saveRecords(filtered);
  return true;
}

/**
 * 获取设置
 * @returns {{ splitPercentage: number }}
 */
function getSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.SETTINGS));
    return saved ? { ...DEFAULT_SETTINGS, ...saved } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 保存设置
 * @param {{ splitPercentage: number }} settings
 */
function saveSettings(settings) {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

/**
 * 根据设置的比例重新计算所有记录的 profit/partnerShare
 * @param {number} ratio
 */
function recalcAllRecords(ratio) {
  const records = getRecords();
  records.forEach(r => {
    r.profit = calcRound(r.totalIncome * (1 - ratio / 100));
    r.partnerShare = calcRound(r.totalIncome * (ratio / 100));
  });
  saveRecords(records);
}

/**
 * 导入备份数据（智能合并）
 * 同日期覆盖，新日期添加，保留设置
 * @param {object} backup - 导入的备份对象 { version, records, settings }
 * @returns {{ added: number, updated: number, settingsUpdated: boolean, total: number }}
 */
function importMergeRecords(backup) {
  if (!backup || !Array.isArray(backup.records)) {
    throw new Error('备份文件格式无效');
  }

  const localRecords = getRecords();
  const backupRecords = backup.records;
  let added = 0, updated = 0;

  // 按日期建立本地索引
  const localByDate = {};
  localRecords.forEach(r => { localByDate[r.date] = r; });

  backupRecords.forEach(br => {
    if (!br.date || typeof br.totalIncome !== 'number') return; // 跳过无效记录

    const local = localByDate[br.date];
    if (local) {
      // 同日期 → 覆盖（保留原 id 和 createdAt）
      local.totalIncome = br.totalIncome;
      local.profit = br.profit;
      local.partnerShare = br.partnerShare;
      local.updatedAt = new Date().toISOString();
      updated++;
    } else {
      // 新日期 → 新增（确保有 id）
      const record = {
        id: br.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        date: br.date,
        totalIncome: br.totalIncome,
        profit: br.profit,
        partnerShare: br.partnerShare,
        createdAt: br.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      localRecords.push(record);
      localByDate[br.date] = record;
      added++;
    }
  });

  saveRecords(localRecords);

  // 导入设置
  let settingsUpdated = false;
  if (backup.settings && typeof backup.settings.splitPercentage === 'number') {
    const pct = Math.round(backup.settings.splitPercentage);
    if (pct >= 0 && pct <= 100) {
      saveSettings({ splitPercentage: pct });
      settingsUpdated = true;
      // 按新比例重算所有记录
      recalcAllRecords(pct);
    }
  }

  return { added, updated, settingsUpdated, total: localRecords.length };
}

/**
 * 辅助：四舍五入保留两位小数
 */
function calcRound(val) {
  return Math.round(val * 100) / 100;
}

// ===== 其他分成记录 CRUD =====

/**
 * 获取所有其他分成记录
 * @returns {Array}
 */
function getOtherRecords() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.OTHER_RECORDS)) || [];
  } catch {
    return [];
  }
}

/**
 * 保存所有其他分成记录
 * @param {Array} records
 */
function saveOtherRecords(records) {
  localStorage.setItem(KEYS.OTHER_RECORDS, JSON.stringify(records));
}

/**
 * 根据日期查找其他分成记录
 * @param {string} date - "YYYY-MM-DD"
 * @returns {object|null}
 */
function getOtherRecordByDate(date) {
  const records = getOtherRecords();
  return records.find(r => r.date === date) || null;
}

/**
 * 根据 ID 查找其他分成记录
 * @param {string} id
 * @returns {object|null}
 */
function getOtherRecordById(id) {
  const records = getOtherRecords();
  return records.find(r => r.id === id) || null;
}

/**
 * 新增其他分成记录
 * @param {object} record
 */
function addOtherRecord(record) {
  const records = getOtherRecords();
  records.push(record);
  saveOtherRecords(records);
}

/**
 * 更新其他分成记录的总金额，自动重算 earnings 和 cost
 * @param {string} id
 * @param {number} newAmount
 */
function updateOtherRecord(id, newAmount) {
  const records = getOtherRecords();
  const idx = records.findIndex(r => r.id === id);
  if (idx === -1) return false;

  records[idx].totalAmount = newAmount;
  records[idx].earnings = calcRound(newAmount * OTHER_EARNINGS_RATIO);
  records[idx].cost = calcRound(newAmount * (1 - OTHER_EARNINGS_RATIO));
  records[idx].updatedAt = new Date().toISOString();
  saveOtherRecords(records);
  return true;
}

/**
 * 删除其他分成记录
 * @param {string} id
 * @returns {boolean}
 */
function deleteOtherRecord(id) {
  const records = getOtherRecords();
  const filtered = records.filter(r => r.id !== id);
  if (filtered.length === records.length) return false;
  saveOtherRecords(filtered);
  return true;
}

// ===== 账本信息 =====

/**
 * 获取本地缓存的账本信息
 * @returns {{ id: number, name: string, settings: object }|null}
 */
function getLedgerInfo() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.LEDGER_INFO)) || null;
  } catch {
    return null;
  }
}

/**
 * 保存账本信息到本地
 * @param {object} info
 */
function saveLedgerInfo(info) {
  localStorage.setItem(KEYS.LEDGER_INFO, JSON.stringify(info));
}

/**
 * 清除本地账本信息（退出登录）
 */
function clearLedgerInfo() {
  localStorage.removeItem(KEYS.LEDGER_INFO);
}
