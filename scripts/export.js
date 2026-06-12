/**
 * export.js — CSV 导出 + JSON 备份导出
 */

/**
 * 导出指定月份的记录为 CSV 文件
 * @param {Array} records - 筛选后的记录数组
 * @param {number} year
 * @param {number} month - 1~12
 */
function exportCSV(records, year, month) {
  if (!records || records.length === 0) {
    alert('当前月份没有数据可导出');
    return;
  }

  // BOM 使 Excel 正确识别 UTF-8 中文
  const BOM = '﻿';
  const headers = ['日期', '总收入', '利润(到手)', '分成', '记录时间'];
  const rows = records.map(r => [
    r.date,
    r.totalIncome.toFixed(2),
    r.profit.toFixed(2),
    r.partnerShare.toFixed(2),
    r.updatedAt || r.createdAt || ''
  ]);

  const csvContent = BOM + headers.join(',') + '\n' +
    rows.map(row => row.join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `收入记录_${year}年${month}月.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 导出完整备份（所有记录 + 设置）为 JSON 文件
 * @param {Array} records - 所有记录
 * @param {object} settings - 设置对象
 */
function exportBackup(records, settings) {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    records: records,
    settings: settings
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().split('T')[0];
  const link = document.createElement('a');
  link.href = url;
  link.download = `分账助手_备份_${dateStr}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
