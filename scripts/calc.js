/**
 * calc.js — 金额计算与统计
 * 纯函数，不依赖 DOM 或 storage
 */

/**
 * 计算分成和利润
 * @param {number} income - 总收入
 * @param {number} ratio - 分成比例（百分比，如 30）
 * @returns {{ profit: number, partnerShare: number }}
 */
function calcSplit(income, ratio) {
  const partnerShare = round2(income * (ratio / 100));
  const profit = round2(income - partnerShare);
  return { profit, partnerShare };
}

/**
 * 计算某月统计
 * @param {Array} records - 所有记录
 * @param {number} year
 * @param {number} month - 1~12
 * @returns {{ totalIncome: number, totalProfit: number, totalShare: number, count: number }}
 */
function calcMonthStats(records, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const filtered = records.filter(r => r.date.startsWith(prefix));

  let totalIncome = 0, totalProfit = 0, totalShare = 0;
  filtered.forEach(r => {
    totalIncome += r.totalIncome;
    totalProfit += r.profit;
    totalShare += r.partnerShare;
  });

  return {
    totalIncome: round2(totalIncome),
    totalProfit: round2(totalProfit),
    totalShare: round2(totalShare),
    count: filtered.length
  };
}

/**
 * 计算某年统计
 * @param {Array} records
 * @param {number} year
 * @returns {{ totalIncome: number, totalProfit: number, totalShare: number, count: number }}
 */
function calcYearStats(records, year) {
  const prefix = `${year}-`;
  const filtered = records.filter(r => r.date.startsWith(prefix));

  let totalIncome = 0, totalProfit = 0, totalShare = 0;
  filtered.forEach(r => {
    totalIncome += r.totalIncome;
    totalProfit += r.profit;
    totalShare += r.partnerShare;
  });

  return {
    totalIncome: round2(totalIncome),
    totalProfit: round2(totalProfit),
    totalShare: round2(totalShare),
    count: filtered.length
  };
}

/**
 * 获取最近 N 天记录
 * @param {Array} records
 * @param {number} days - 默认 7
 * @returns {Array} 按日期降序排列
 */
function getRecentRecords(records, days = 7) {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  return sorted.slice(0, days);
}

/**
 * 格式化金额为人民币显示
 * @param {number} num
 * @returns {string} 如 ¥1,200.00
 */
function formatMoney(num) {
  const fixed = num.toFixed(2);
  const parts = fixed.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `¥${intPart}.${parts[1]}`;
}

/**
 * 格式化日期为中文显示
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string} 如 "06月11日"
 */
function formatDateShort(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${month}月${day}日`;
}

/**
 * 格式化日期为完整显示
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string} 如 "2026年06月11日"
 */
function formatDateLong(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${year}年${month}月${day}日`;
}

/**
 * 四舍五入保留两位小数
 */
function round2(val) {
  return Math.round(val * 100) / 100;
}

// ===== 其他分成（固定 60% 收益 / 40% 成本） =====

const OTHER_EARNINGS_RATIO = 0.6;

/**
 * 计算其他分成的收益和成本
 * @param {number} totalAmount - 总额
 * @returns {{ earnings: number, cost: number }}
 */
function calcOtherSplit(totalAmount) {
  const earnings = round2(totalAmount * OTHER_EARNINGS_RATIO);
  const cost = round2(totalAmount - earnings);
  return { earnings, cost };
}

/**
 * 计算其他分成某月统计
 * @param {Array} records
 * @param {number} year
 * @param {number} month
 * @returns {{ totalAmount: number, totalEarnings: number, totalCost: number, count: number }}
 */
function calcOtherMonthStats(records, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const filtered = records.filter(r => r.date.startsWith(prefix));

  let totalAmount = 0, totalEarnings = 0, totalCost = 0;
  filtered.forEach(r => {
    totalAmount += r.totalAmount;
    totalEarnings += r.earnings;
    totalCost += r.cost;
  });

  return {
    totalAmount: round2(totalAmount),
    totalEarnings: round2(totalEarnings),
    totalCost: round2(totalCost),
    count: filtered.length
  };
}

/**
 * 计算其他分成某年统计
 * @param {Array} records
 * @param {number} year
 * @returns {{ totalAmount: number, totalEarnings: number, totalCost: number, count: number }}
 */
function calcOtherYearStats(records, year) {
  const prefix = `${year}-`;
  const filtered = records.filter(r => r.date.startsWith(prefix));

  let totalAmount = 0, totalEarnings = 0, totalCost = 0;
  filtered.forEach(r => {
    totalAmount += r.totalAmount;
    totalEarnings += r.earnings;
    totalCost += r.cost;
  });

  return {
    totalAmount: round2(totalAmount),
    totalEarnings: round2(totalEarnings),
    totalCost: round2(totalCost),
    count: filtered.length
  };
}

/**
 * 获取其他分成最近 N 天记录
 * @param {Array} records
 * @param {number} days
 * @returns {Array}
 */
function getOtherRecentRecords(records, days = 7) {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  return sorted.slice(0, days);
}
